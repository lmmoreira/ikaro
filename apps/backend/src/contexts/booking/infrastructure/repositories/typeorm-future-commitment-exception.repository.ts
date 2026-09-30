import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { drainDomainEvents } from '../../../../shared/infrastructure/outbox/drain-domain-events';
import { runInNewTransaction } from '../../../../shared/infrastructure/run-in-new-transaction';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  FutureCommitmentExceptionFilters,
  FutureCommitmentExceptionImpact,
  IFutureCommitmentExceptionRepository,
} from '../../application/ports/future-commitment-exception-repository.port';
import { FutureCommitmentException } from '../../domain/future-commitment-exception.aggregate';
import { FutureCommitmentExceptionEntity } from '../entities/future-commitment-exception.entity';
import { toDomain, toEntity } from './typeorm-future-commitment-exception.mapper';

@Injectable()
export class TypeOrmFutureCommitmentExceptionRepository implements IFutureCommitmentExceptionRepository {
  constructor(
    @InjectRepository(FutureCommitmentExceptionEntity)
    private readonly repo: Repository<FutureCommitmentExceptionEntity>,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
  ) {}

  async findById(id: string, tenantId: string): Promise<FutureCommitmentException | null> {
    const entity = await this.repo.findOne({ where: { id, tenantId } });
    return entity ? toDomain(entity) : null;
  }

  async findByIdForUpdate(id: string, tenantId: string): Promise<FutureCommitmentException | null> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('findByIdForUpdate must be called inside an active transaction');
    }
    const entity = await manager.findOne(FutureCommitmentExceptionEntity, {
      where: { id, tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    return entity ? toDomain(entity) : null;
  }

  // Runs inside the raise transaction (after lockResources), so it reads through the ambient
  // manager: a sibling raise earlier in the same transaction must be visible.
  async findOpenByImpact(
    tenantId: string,
    impact: FutureCommitmentExceptionImpact,
  ): Promise<FutureCommitmentException | null> {
    const manager = getActiveEntityManager();
    const repo = manager ? manager.getRepository(FutureCommitmentExceptionEntity) : this.repo;
    const entity = await repo.findOne({
      where: {
        tenantId,
        sourceType: impact.sourceType,
        sourceId: impact.sourceId,
        affectedType: impact.affectedType,
        affectedId: impact.affectedId,
        status: 'OPEN',
      },
    });
    return entity ? toDomain(entity) : null;
  }

  async findByTenant(
    tenantId: string,
    filters: FutureCommitmentExceptionFilters = {},
  ): Promise<FutureCommitmentException[]> {
    const entities = await this.repo.find({
      where: { tenantId, ...(filters.status ? { status: filters.status } : {}) },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return entities.map(toDomain);
  }

  async save(exception: FutureCommitmentException): Promise<void> {
    const manager = getActiveEntityManager();
    if (manager) {
      await this.persist(manager, exception);
    } else {
      await runInNewTransaction(this.repo.manager, (tx) => this.persist(tx, exception));
    }
  }

  private async persist(
    manager: EntityManager,
    exception: FutureCommitmentException,
  ): Promise<void> {
    await manager.save(FutureCommitmentExceptionEntity, toEntity(exception));
    await drainDomainEvents(exception, this.outboxPublisher);
  }
}
