import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import {
  ILoyaltyBalanceRepository,
  LoyaltyBalanceTenantCustomerPair,
} from '../../application/ports/loyalty-balance-repository.port';
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

  async findManyByCustomers(tenantId: string, customerIds: string[]): Promise<LoyaltyBalance[]> {
    if (customerIds.length === 0) return [];
    const entities = await this.repo.find({
      where: { tenantId, customerId: In(customerIds) },
    });
    return entities.map((entity) => this.toDomain(entity));
  }

  async findManyByTenantCustomerPairs(
    pairs: LoyaltyBalanceTenantCustomerPair[],
  ): Promise<LoyaltyBalance[]> {
    if (pairs.length === 0) return [];
    const qb = this.repo.createQueryBuilder('balance').where(
      new Brackets((sub) => {
        pairs.forEach((pair, i) => {
          const clause = `(balance.tenantId = :tenantId${i} AND balance.customerId = :customerId${i})`;
          const params = { [`tenantId${i}`]: pair.tenantId, [`customerId${i}`]: pair.customerId };
          if (i === 0) sub.where(clause, params);
          else sub.orWhere(clause, params);
        });
      }),
    );
    const entities = await qb.getMany();
    return entities.map((entity) => this.toDomain(entity));
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
