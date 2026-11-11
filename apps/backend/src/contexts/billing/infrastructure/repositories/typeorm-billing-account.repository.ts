import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { IBillingAccountRepository } from '../../application/ports/billing-account-repository.port';
import { BillingAccount } from '../../domain/billing-account.aggregate';
import {
  BillingAccountAlreadyExistsError,
  BillingAccountSubscriptionMissingError,
} from '../../domain/errors/billing-domain.error';
import { BillingAccountEntity } from '../entities/billing-account.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import {
  billingAccountToDomain,
  billingAccountToEntity,
  billingAccountUpdateSet,
} from './typeorm-billing-account.mapper';

const BILLING_ACCOUNT_TENANT_UNIQUE_INDEX = 'UQ_billing_billing_accounts_tenant';

@Injectable()
export class TypeOrmBillingAccountRepository implements IBillingAccountRepository {
  constructor(
    @InjectRepository(BillingAccountEntity)
    private readonly repo: Repository<BillingAccountEntity>,
  ) {}

  async findByTenantId(tenantId: string): Promise<BillingAccount | null> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const entity = await manager.findOne(BillingAccountEntity, { where: { tenantId } });
    if (!entity) return null;
    // The billing country is the subscription's, immutable there: read it, never copy it.
    const subscription = await manager.findOne(SubscriptionEntity, {
      where: { tenantId },
      select: { id: true, countryCode: true },
    });
    if (!subscription) throw new BillingAccountSubscriptionMissingError();
    return billingAccountToDomain(
      entity,
      CountryCode.reconstitute(subscription.countryCode.trim()),
    );
  }

  /**
   * Updates the tenant's own row by `(id, tenant_id)`, and inserts when there is none. The tenant
   * predicate is part of the write, so an id that belongs to another tenant never touches that
   * tenant's row; the insert then fails on the primary key. The country and the identity are never
   * in the SET list (the country lives on the subscription).
   */
  async save(account: BillingAccount): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const entity = billingAccountToEntity(account);
    const updated = await manager.update(
      BillingAccountEntity,
      { id: entity.id, tenantId: entity.tenantId },
      billingAccountUpdateSet(entity),
    );
    if (updated.affected === 1) return;
    await this.insert(manager, entity);
  }

  private async insert(manager: EntityManager, entity: BillingAccountEntity): Promise<void> {
    try {
      await manager.insert(BillingAccountEntity, entity);
    } catch (err) {
      const driverError = err instanceof QueryFailedError ? err.driverError : undefined;
      if (
        driverError?.code === '23505' &&
        driverError.constraint === BILLING_ACCOUNT_TENANT_UNIQUE_INDEX
      ) {
        throw new BillingAccountAlreadyExistsError();
      }
      throw err;
    }
  }
}
