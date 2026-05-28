import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ILoyaltyRedemptionRepository,
  PaginatedRedemptions,
} from '../../application/ports/loyalty-redemption-repository.port';
import { LoyaltyRedemption } from '../../domain/loyalty-redemption.aggregate';
import { LoyaltyRedemptionEntity } from '../entities/loyalty-redemption.entity';

@Injectable()
export class TypeOrmLoyaltyRedemptionRepository implements ILoyaltyRedemptionRepository {
  constructor(
    @InjectRepository(LoyaltyRedemptionEntity)
    private readonly repo: Repository<LoyaltyRedemptionEntity>,
  ) {}

  async save(redemption: LoyaltyRedemption): Promise<void> {
    const manager = getActiveEntityManager();
    const entity = this.toEntity(redemption);
    if (manager) {
      await manager.save(LoyaltyRedemptionEntity, entity);
    } else {
      await this.repo.save(entity);
    }
  }

  async findByCustomer(
    tenantId: string,
    customerId: string,
    page: number,
    limit: number,
  ): Promise<PaginatedRedemptions> {
    const [entities, total] = await this.repo.findAndCount({
      where: { tenantId, customerId },
      order: { redeemedAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items: entities.map((e) => this.toDomain(e)), total };
  }

  private toDomain(entity: LoyaltyRedemptionEntity): LoyaltyRedemption {
    return LoyaltyRedemption.reconstitute({
      id: entity.id,
      tenantId: entity.tenantId,
      customerId: entity.customerId,
      pointsRedeemed: entity.pointsRedeemed,
      redeemedBy: entity.redeemedBy,
      notes: entity.notes,
      bookingId: entity.bookingId,
      redeemedAt: entity.redeemedAt,
    });
  }

  private toEntity(redemption: LoyaltyRedemption): LoyaltyRedemptionEntity {
    const entity = new LoyaltyRedemptionEntity();
    entity.id = redemption.id;
    entity.tenantId = redemption.tenantId;
    entity.customerId = redemption.customerId;
    entity.pointsRedeemed = redemption.pointsRedeemed;
    entity.redeemedBy = redemption.redeemedBy;
    entity.notes = redemption.notes;
    entity.bookingId = redemption.bookingId;
    entity.redeemedAt = redemption.redeemedAt;
    return entity;
  }
}
