import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { CountryCode } from '../../../../shared/value-objects/country-code.vo';
import { IBillingAccountRepository } from '../../application/ports/billing-account-repository.port';
import { BillingAccount } from '../../domain/billing-account.aggregate';
import { BillingAccountSubscriptionMissingError } from '../../domain/errors/billing-domain.error';
import { BillingAccountEntity } from '../entities/billing-account.entity';
import { SubscriptionEntity } from '../entities/subscription.entity';
import { billingAccountToDomain, billingAccountToEntity } from './typeorm-billing-account.mapper';

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

  async save(account: BillingAccount): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const entity = billingAccountToEntity(account);
    // No version column here: one actor edits an account at a time, so the row is upserted by id.
    // `orUpdate` names real DB columns; the country and the identity are never in the SET list.
    await manager
      .createQueryBuilder()
      .insert()
      .into(BillingAccountEntity)
      .values(entity as QueryDeepPartialEntity<BillingAccountEntity>)
      .orUpdate(
        [
          'tax_id_type',
          'tax_id',
          'legal_name',
          'billing_email',
          'address',
          'provider',
          'provider_customer_id',
          'auto_billing',
          'auto_billing_status',
          'auto_billing_label',
          'terms_version',
          'terms_accepted_at',
          'terms_accepted_by',
          'updated_at',
        ],
        ['id'],
      )
      .execute();
  }
}
