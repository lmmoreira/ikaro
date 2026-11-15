import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ILoyaltyEntryRepository,
  PaginatedLoyaltyEntries,
} from '../../application/ports/loyalty-entry-repository.port';
import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import { LoyaltyEntryEntity } from '../entities/loyalty-entry.entity';

@Injectable()
export class TypeOrmLoyaltyEntryRepository implements ILoyaltyEntryRepository {
  constructor(
    @InjectRepository(LoyaltyEntryEntity)
    private readonly repo: Repository<LoyaltyEntryEntity>,
  ) {}

  async save(entry: LoyaltyEntry): Promise<void> {
    const manager = getActiveEntityManager();
    const entity = this.toEntity(entry);
    if (manager) {
      await manager.save(LoyaltyEntryEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  async existsById(id: string): Promise<boolean> {
    return this.repo.exists({ where: { id } });
  }

  async findUnprocessedExpiringUntil(to: Date): Promise<LoyaltyEntry[]> {
    const entities = await this.repo
      .createQueryBuilder('e')
      .where('e.expiresAt <= :to', { to })
      .andWhere(`NOT EXISTS (SELECT 1 FROM loyalty.balance_expiry_log l WHERE l.entry_id = e.id)`)
      .getMany();
    return entities.map((e) => this.toDomain(e));
  }

  async findByCustomerPaginated(
    tenantId: string,
    customerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedLoyaltyEntries> {
    const [entities, total] = await this.repo.findAndCount({
      where: { tenantId, customerId },
      order: { earnedAt: 'DESC' },
      take: limit,
      skip: (page - 1) * limit,
    });
    return { items: entities.map((e) => this.toDomain(e)), total };
  }

  async findUnprocessedByCustomer(tenantId: string, customerId: string): Promise<LoyaltyEntry[]> {
    const entities = await this.repo
      .createQueryBuilder('e')
      .where('e.tenantId = :tenantId AND e.customerId = :customerId', { tenantId, customerId })
      .andWhere(`NOT EXISTS (SELECT 1 FROM loyalty.balance_expiry_log l WHERE l.entry_id = e.id)`)
      .getMany();
    return entities.map((e) => this.toDomain(e));
  }

  private toDomain(entity: LoyaltyEntryEntity): LoyaltyEntry {
    return LoyaltyEntry.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      customerId: entity.customerId,
      bookingId: entity.bookingId,
      bookingLineId: entity.bookingLineId,
      serviceId: entity.serviceId,
      points: entity.points,
      earnedAt: entity.earnedAt,
      expiresAt: entity.expiresAt,
    });
  }

  private toEntity(entry: LoyaltyEntry): LoyaltyEntryEntity {
    const entity = new LoyaltyEntryEntity();
    entity.id = entry.id;
    entity.tenantId = entry.tenantId;
    entity.customerId = entry.customerId;
    entity.bookingId = entry.bookingId;
    entity.bookingLineId = entry.bookingLineId;
    entity.serviceId = entry.serviceId;
    entity.points = entry.points;
    entity.earnedAt = entry.earnedAt;
    entity.expiresAt = entry.expiresAt;
    return entity;
  }
}
