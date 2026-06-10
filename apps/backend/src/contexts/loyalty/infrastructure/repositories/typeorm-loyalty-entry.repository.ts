import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ILoyaltyEntryRepository,
  NextExpiry,
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

  async findExpiringBefore(date: Date): Promise<LoyaltyEntry[]> {
    const entities = await this.repo.find({
      where: { expiresAt: LessThan(date) },
    });
    return entities.map((e) => this.toDomain(e));
  }

  async findExpiringSoon(from: Date, to: Date): Promise<LoyaltyEntry[]> {
    const entities = await this.repo.find({
      where: { expiresAt: Between(from, to) },
    });
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

  async findNextExpiry(tenantId: string, customerId: string): Promise<NextExpiry | null> {
    const rows = await this.repo.query<{ expiryDate: string; points: string }[]>(
      `SELECT expires_at AS "expiryDate", SUM(points)::int AS points
       FROM loyalty.loyalty_entries
       WHERE tenant_id = $1 AND customer_id = $2 AND expires_at > NOW()
       GROUP BY expires_at
       ORDER BY expires_at ASC
       LIMIT 1`,
      [tenantId, customerId],
    );

    if (!rows.length || !rows[0].expiryDate) return null;
    return { expiryDate: new Date(rows[0].expiryDate), points: Number(rows[0].points) };
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
