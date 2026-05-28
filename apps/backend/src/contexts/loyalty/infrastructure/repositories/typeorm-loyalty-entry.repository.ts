import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ILoyaltyEntryRepository } from '../../application/ports/loyalty-entry-repository.port';
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

  async findExpiringBefore(date: Date): Promise<LoyaltyEntry[]> {
    const entities = await this.repo.find({
      where: { expiresAt: LessThan(date) },
    });
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
