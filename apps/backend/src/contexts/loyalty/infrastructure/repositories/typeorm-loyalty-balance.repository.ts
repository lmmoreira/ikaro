import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ILoyaltyBalanceRepository } from '../../application/ports/loyalty-balance-repository.port';
import { LoyaltyBalance } from '../../domain/loyalty-balance.aggregate';
import { LoyaltyBalanceEntity } from '../entities/loyalty-balance.entity';

@Injectable()
export class TypeOrmLoyaltyBalanceRepository implements ILoyaltyBalanceRepository {
  constructor(
    @InjectRepository(LoyaltyBalanceEntity)
    private readonly repo: Repository<LoyaltyBalanceEntity>,
  ) {}

  async findByCustomer(tenantId: string, customerId: string): Promise<LoyaltyBalance | null> {
    const entity = await this.repo.findOne({ where: { tenantId, customerId } });
    return entity ? this.toDomain(entity) : null;
  }

  async upsert(balance: LoyaltyBalance): Promise<void> {
    const manager = getActiveEntityManager();
    const entity = this.toEntity(balance);
    const conflictPaths: (keyof LoyaltyBalanceEntity)[] = ['tenantId', 'customerId'];
    if (manager) {
      await manager.upsert(LoyaltyBalanceEntity, entity, conflictPaths);
    } else {
      await this.repo.upsert(entity, conflictPaths);
    }
  }

  private toDomain(entity: LoyaltyBalanceEntity): LoyaltyBalance {
    return LoyaltyBalance.reconstitute({
      tenantId: entity.tenantId,
      customerId: entity.customerId,
      currentPoints: entity.currentPoints,
    });
  }

  private toEntity(balance: LoyaltyBalance): LoyaltyBalanceEntity {
    const entity = new LoyaltyBalanceEntity();
    entity.tenantId = balance.tenantId;
    entity.customerId = balance.customerId;
    entity.currentPoints = balance.currentPoints;
    return entity;
  }
}
