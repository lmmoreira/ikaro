import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IProviderHealthRepository } from '../../application/ports/provider-health-repository.port';
import { ProviderHealth, type ProviderWebhookStatus } from '../../domain/provider-health';
import { ProviderHealthEntity } from '../entities/provider-health.entity';

// The real column names: the conflict target and the overwritten columns of the upsert.
const KEY_COLUMN = 'merchant_profile_key';
const OVERWRITTEN_COLUMNS = [
  'last_reconcile_ok_at',
  'last_full_reconcile_at',
  'webhook_status',
  'freeze_active',
  'freeze_since',
  'health_read_failures',
  'webhook_reenabled_at',
  'updated_at',
];

function toDomain(entity: ProviderHealthEntity): ProviderHealth {
  return ProviderHealth.reconstitute({
    merchantProfileKey: entity.merchantProfileKey,
    lastReconcileOkAt: entity.lastReconcileOkAt,
    lastFullReconcileAt: entity.lastFullReconcileAt,
    webhookStatus: entity.webhookStatus as ProviderWebhookStatus,
    freezeActive: entity.freezeActive,
    freezeSince: entity.freezeSince,
    healthReadFailures: entity.healthReadFailures,
    webhookReenabledAt: entity.webhookReenabledAt,
    updatedAt: entity.updatedAt,
  });
}

function toEntity(health: ProviderHealth): ProviderHealthEntity {
  const entity = new ProviderHealthEntity();
  entity.merchantProfileKey = health.merchantProfileKey;
  entity.lastReconcileOkAt = health.lastReconcileOkAt;
  entity.lastFullReconcileAt = health.lastFullReconcileAt;
  entity.webhookStatus = health.webhookStatus;
  entity.freezeActive = health.freezeActive;
  entity.freezeSince = health.freezeSince;
  entity.healthReadFailures = health.healthReadFailures;
  entity.webhookReenabledAt = health.webhookReenabledAt;
  entity.updatedAt = health.updatedAt;
  return entity;
}

const RECORD_READ_FAILURE_SQL = `
  INSERT INTO "billing"."provider_health" ("merchant_profile_key", "health_read_failures", "updated_at")
  VALUES ($1, 1, $2)
  ON CONFLICT ("merchant_profile_key") DO UPDATE
    SET "health_read_failures" = LEAST("provider_health"."health_read_failures" + 1, 1000)
  RETURNING "health_read_failures"
`;

/** A platform-wide table (no `tenant_id`): every read and write is keyed by the merchant profile key. */
@Injectable()
export class TypeOrmProviderHealthRepository implements IProviderHealthRepository {
  constructor(
    @InjectRepository(ProviderHealthEntity)
    private readonly repo: Repository<ProviderHealthEntity>,
  ) {}

  async findByKey(merchantProfileKey: string): Promise<ProviderHealth | null> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const entity = await manager.findOne(ProviderHealthEntity, { where: { merchantProfileKey } });
    return entity === null ? null : toDomain(entity);
  }

  async listFrozenKeys(): Promise<string[]> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const rows = await manager.find(ProviderHealthEntity, {
      select: { merchantProfileKey: true },
      where: { freezeActive: true },
      order: { merchantProfileKey: 'ASC' },
    });
    return rows.map((row) => row.merchantProfileKey);
  }

  async save(health: ProviderHealth): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    await manager
      .createQueryBuilder()
      .insert()
      .into(ProviderHealthEntity)
      .values(toEntity(health))
      .orUpdate(OVERWRITTEN_COLUMNS, [KEY_COLUMN])
      .execute();
  }

  async recordReconcileOk(merchantProfileKey: string, at: Date, fullPass: boolean): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    await manager
      .createQueryBuilder()
      .insert()
      .into(ProviderHealthEntity)
      .values({
        merchantProfileKey,
        lastReconcileOkAt: at,
        lastFullReconcileAt: fullPass ? at : null,
        updatedAt: at,
      })
      // Only these columns: the freeze, the webhook status and the read counter belong to the self-heal (M26-S08).
      .orUpdate(
        fullPass
          ? ['last_reconcile_ok_at', 'last_full_reconcile_at', 'updated_at']
          : ['last_reconcile_ok_at', 'updated_at'],
        [KEY_COLUMN],
      )
      .execute();
  }

  async recordHealthReadOk(
    merchantProfileKey: string,
    webhookStatus: ProviderWebhookStatus,
    at: Date,
    reenabledAt: Date | null,
  ): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    await manager
      .createQueryBuilder()
      .insert()
      .into(ProviderHealthEntity)
      .values({
        merchantProfileKey,
        webhookStatus,
        healthReadFailures: 0,
        updatedAt: at,
        ...(reenabledAt ? { webhookReenabledAt: reenabledAt } : {}),
      })
      // `webhook_reenabled_at` is the instant the alert-closing rule compares a delivery against:
      // only a re-enable writes it, so a reconcile write can never push it forward.
      .orUpdate(
        reenabledAt
          ? ['webhook_status', 'health_read_failures', 'webhook_reenabled_at']
          : ['webhook_status', 'health_read_failures'],
        [KEY_COLUMN],
      )
      .execute();
  }

  async recordHealthReadFailure(merchantProfileKey: string, at: Date): Promise<number> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    // One statement, so two overlapping runs cannot lose an increment; the cap keeps the SMALLINT safe.
    const result = (await manager.query(RECORD_READ_FAILURE_SQL, [merchantProfileKey, at])) as
      { health_read_failures: number }[] | [{ health_read_failures: number }[], number];
    const rows = (Array.isArray(result[0]) ? result[0] : result) as {
      health_read_failures: number;
    }[];
    return rows[0].health_read_failures;
  }

  async setFreeze(merchantProfileKey: string, since: Date | null): Promise<boolean> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    // Both columns in one statement (the table's CHECK keeps them together), and only when the
    // state really changes, so two overlapping runs agree on who changed it. Clearing also checks
    // its own conditions in the statement (no failed read, a reconcile success after the freeze
    // started), so a failed read written after the caller's snapshot cannot be cleared over.
    const result = await manager
      .createQueryBuilder()
      .update(ProviderHealthEntity)
      .set({ freezeActive: since !== null, freezeSince: since })
      .where(
        since === null
          ? `merchantProfileKey = :merchantProfileKey AND freezeActive = :previous
             AND healthReadFailures = 0 AND lastReconcileOkAt > freezeSince`
          : 'merchantProfileKey = :merchantProfileKey AND freezeActive = :previous',
        { merchantProfileKey, previous: since === null },
      )
      .execute();
    return (result.affected ?? 0) > 0;
  }
}
