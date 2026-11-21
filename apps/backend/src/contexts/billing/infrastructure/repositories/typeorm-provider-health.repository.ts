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
  entity.updatedAt = health.updatedAt;
  return entity;
}

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
      // Only these columns: the freeze and the webhook status belong to the self-heal (M26-S08).
      .orUpdate(
        fullPass
          ? ['last_reconcile_ok_at', 'last_full_reconcile_at', 'updated_at']
          : ['last_reconcile_ok_at', 'updated_at'],
        [KEY_COLUMN],
      )
      .execute();
  }
}
