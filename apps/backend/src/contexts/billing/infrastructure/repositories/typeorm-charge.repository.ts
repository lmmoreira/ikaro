import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Not, QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ChargeRef,
  OverdueChargeRef,
  PendingCreationRef,
  IChargeRepository,
  ListChargesQuery,
} from '../../application/ports/charge-repository.port';
import type { BillingProvider } from '../../domain/billing-account.aggregate';
import { Charge } from '../../domain/charge.aggregate';
import { PROVIDER_CREATION_LEASE_MINUTES } from '../../domain/billing-constants';
import { ChargeAlreadyExistsError } from '../../domain/errors/charge-already-exists.error';
import { ChargeConcurrentModificationError } from '../../domain/errors/charge-concurrent-modification.error';
import { RecoveryChargeAlreadyOpenError } from '../../domain/errors/recovery-charge-already-open.error';
import { ChargeLineEntity } from '../entities/charge-line.entity';
import { ChargeEntity } from '../entities/charge.entity';
import {
  chargeLineToEntity,
  chargeToDomain,
  chargeToEntity,
  chargeUpdateSet,
} from './typeorm-charge.mapper';
import {
  buildOpenDueQuery,
  buildOpenQuery,
  buildOverdueCandidatesQuery,
  buildPendingCreationQuery,
  buildProviderCancelPendingQuery,
} from './typeorm-charge.job-queries';
import { CLAIM_FOR_PROVIDER_CREATION_SQL } from './typeorm-charge.sql';

const PERIOD_UNIQUE_INDEX = 'UQ_billing_charges_period';
const OPEN_RECOVERY_UNIQUE_INDEX = 'UQ_billing_charges_open_recovery';
const OPEN_STATUSES = ['PENDING', 'OVERDUE'];

@Injectable()
export class TypeOrmChargeRepository implements IChargeRepository {
  constructor(
    @InjectRepository(ChargeEntity)
    private readonly repo: Repository<ChargeEntity>,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
  ) {}

  findById(tenantId: string, id: string): Promise<Charge | null> {
    return this.loadOne(this.readManager(), { tenantId, id }, false);
  }

  findByIdForJob(id: string): Promise<Charge | null> {
    return this.loadOne(this.readManager(), { id }, false);
  }

  async findByIdForUpdate(tenantId: string, id: string): Promise<Charge | null> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('findByIdForUpdate must be called inside an active transaction');
    }
    return this.loadOne(manager, { tenantId, id }, true);
  }

  findByProviderChargeId(
    tenantId: string,
    provider: BillingProvider,
    providerChargeId: string,
  ): Promise<Charge | null> {
    return this.loadOne(this.readManager(), { tenantId, provider, providerChargeId }, false);
  }

  async findOpenByTenant(tenantId: string): Promise<Charge[]> {
    const manager = this.readManager();
    const rows = await manager.find(ChargeEntity, {
      where: { tenantId, status: In(OPEN_STATUSES) },
      order: { dueDate: 'ASC', id: 'ASC' },
    });
    return this.hydrate(manager, tenantId, rows);
  }

  findOpenRecoveryBySubscription(tenantId: string, subscriptionId: string): Promise<Charge | null> {
    return this.loadOne(
      this.readManager(),
      { tenantId, subscriptionId, kind: 'RECOVERY', status: In(OPEN_STATUSES) },
      false,
    );
  }

  // The earliest period start that is not cancelled, so a re-issued charge stands in for the one it
  // replaced; served by `UQ_billing_charges_period`.
  async findFirstPeriodCharge(tenantId: string, subscriptionId: string): Promise<Charge | null> {
    const manager = this.readManager();
    const entity = await manager.findOne(ChargeEntity, {
      where: { tenantId, subscriptionId, kind: 'PERIOD', status: Not('CANCELED') },
      order: { periodStart: 'ASC' },
    });
    if (!entity) return null;
    return (await this.hydrate(manager, tenantId, [entity]))[0] ?? null;
  }

  async listByTenantPage(
    tenantId: string,
    query: ListChargesQuery,
  ): Promise<{ items: Charge[]; total: number }> {
    const manager = this.readManager();
    const [rows, total] = await this.buildPageQuery(manager, tenantId, query).getManyAndCount();
    return { items: await this.hydrate(manager, tenantId, rows), total };
  }

  async save(charge: Charge): Promise<void> {
    const manager = getActiveEntityManager();
    if (manager) {
      await this.persist(manager, charge);
    } else {
      await runInNewTransaction(this.repo.manager, (tx) => this.persist(tx, charge));
    }
  }

  // One autocommit statement on the repository's own manager, never the active transaction: the
  // lease must be committed before the provider call, and a caller already inside a transaction
  // must not hold the row until it ends.
  async claimForProviderCreation(tenantId: string, chargeId: string, now: Date): Promise<boolean> {
    const result = (await this.repo.manager.query(CLAIM_FOR_PROVIDER_CREATION_SQL, [
      tenantId,
      chargeId,
      now,
      PROVIDER_CREATION_LEASE_MINUTES,
    ])) as { id: string }[] | [{ id: string }[], number];
    // TypeORM's UPDATE ... RETURNING may be [rows, rowCount] (see the outbox claim).
    const rows = (Array.isArray(result[0]) ? result[0] : result) as { id: string }[];
    return rows.length === 1;
  }

  async listPendingCreationForJob(
    now: Date,
    limit: number,
    after?: PendingCreationRef,
  ): Promise<PendingCreationRef[]> {
    return buildPendingCreationQuery(this.repo, now, limit, after).getRawMany<PendingCreationRef>();
  }

  listOverdueCandidatesForJob(
    dueOnOrBefore: string,
    limit: number,
    after?: OverdueChargeRef,
  ): Promise<OverdueChargeRef[]> {
    return buildOverdueCandidatesQuery(
      this.repo,
      dueOnOrBefore,
      limit,
      after,
    ).getRawMany<OverdueChargeRef>();
  }

  listOpenDueForJob(dueOnOrBefore: string, limit: number): Promise<ChargeRef[]> {
    return buildOpenDueQuery(this.repo, dueOnOrBefore, limit).getRawMany<ChargeRef>();
  }

  listOpenForJob(limit: number): Promise<ChargeRef[]> {
    return buildOpenQuery(this.repo, limit).getRawMany<ChargeRef>();
  }

  listProviderCancelPendingForJob(limit: number): Promise<ChargeRef[]> {
    return buildProviderCancelPendingQuery(this.repo, limit).getRawMany<ChargeRef>();
  }

  // The page query is public so the integration spec can `EXPLAIN` the exact SQL that runs: it is
  // served by `IDX_billing_charges_history`. The job queries are in `typeorm-charge.job-queries`.
  buildPageQuery(
    manager: EntityManager,
    tenantId: string,
    query: ListChargesQuery,
  ): SelectQueryBuilder<ChargeEntity> {
    return manager
      .createQueryBuilder(ChargeEntity, 'c')
      .where('c.tenantId = :tenantId', { tenantId })
      .orderBy('c.dueDate', 'DESC')
      .addOrderBy('c.id', 'DESC')
      .take(query.limit)
      .skip(query.offset);
  }

  // Reads join the caller's transaction when there is one, so a charge written earlier in it is seen.
  private readManager(): EntityManager {
    return getActiveEntityManager() ?? this.repo.manager;
  }

  private async loadOne(
    manager: EntityManager,
    where: Record<string, unknown>,
    lock: boolean,
  ): Promise<Charge | null> {
    const entity = await manager.findOne(ChargeEntity, {
      where,
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!entity) return null;
    return (await this.hydrate(manager, entity.tenantId, [entity]))[0] ?? null;
  }

  // The lines of every charge in one query, never one per charge. They need no lock of their own:
  // they are written once with the charge and never change.
  private async hydrate(
    manager: EntityManager,
    tenantId: string,
    entities: ChargeEntity[],
  ): Promise<Charge[]> {
    if (entities.length === 0) return [];
    const lines = await manager.find(ChargeLineEntity, {
      where: { tenantId, chargeId: In(entities.map((entity) => entity.id)) },
      order: { featureKey: 'ASC', tier: 'ASC' },
    });
    return entities.map((entity) =>
      chargeToDomain(
        entity,
        lines.filter((line) => line.chargeId === entity.id),
      ),
    );
  }

  private async persist(manager: EntityManager, charge: Charge): Promise<void> {
    const isNew = charge.version === undefined;
    const nextVersion = isNew ? 0 : (charge.version as number) + 1;
    const entity = chargeToEntity(charge, nextVersion);

    if (isNew) {
      await this.insert(manager, entity);
      await manager.insert(
        ChargeLineEntity,
        charge.lines.map((line) => chargeLineToEntity(line, charge.tenantId, charge.id)),
      );
    } else {
      // The optimistic lock, the second line of defence next to B-C1: the row must still be at the
      // version this aggregate was read at. Only the mutable columns are written.
      const result = await manager
        .createQueryBuilder()
        .update(ChargeEntity)
        .set(chargeUpdateSet(entity))
        .where('id = :id', { id: charge.id })
        .andWhere('tenant_id = :tenantId', { tenantId: charge.tenantId })
        .andWhere('version = :version', { version: charge.version })
        .execute();
      if (result.affected !== 1) throw new ChargeConcurrentModificationError();
    }
    charge.markPersisted(nextVersion);
    // In the same transaction as the write (`persist` always runs inside one): a rollback drops the
    // outbox rows with the charge change.
    await drainDomainEvents(charge, this.outboxPublisher);
  }

  private async insert(manager: EntityManager, entity: ChargeEntity): Promise<void> {
    try {
      await manager.insert(ChargeEntity, entity);
    } catch (err) {
      const driverError = err instanceof QueryFailedError ? err.driverError : undefined;
      if (driverError?.code === '23505') {
        if (driverError.constraint === PERIOD_UNIQUE_INDEX) throw new ChargeAlreadyExistsError();
        if (driverError.constraint === OPEN_RECOVERY_UNIQUE_INDEX) {
          throw new RecoveryChargeAlreadyOpenError();
        }
      }
      throw err;
    }
  }
}
