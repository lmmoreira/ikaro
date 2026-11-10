import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FEATURE_PRICE_REPOSITORY } from './application/ports/feature-price-repository.port';
import { GetFeaturePriceAtUseCase } from './application/use-cases/get-feature-price-at.use-case';
import { ListSelectablePricesUseCase } from './application/use-cases/list-selectable-prices.use-case';
import { BILLING_ACCOUNT_REPOSITORY } from './application/ports/billing-account-repository.port';
import { SUBSCRIPTION_REPOSITORY } from './application/ports/subscription-repository.port';
import { BillingAccountEntity } from './infrastructure/entities/billing-account.entity';
import { FeaturePriceVersionEntity } from './infrastructure/entities/feature-price-version.entity';
import { FeaturePriceEntity } from './infrastructure/entities/feature-price.entity';
import { SubscriptionItemEntity } from './infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from './infrastructure/entities/subscription.entity';
import { TypeOrmBillingAccountRepository } from './infrastructure/repositories/typeorm-billing-account.repository';
import { TypeOrmFeaturePriceRepository } from './infrastructure/repositories/typeorm-feature-price.repository';
import { TypeOrmSubscriptionRepository } from './infrastructure/repositories/typeorm-subscription.repository';

// Billing context (Ikaro charging its tenants). Each aggregate story registers its own
// repositories, use cases and controllers here. M25-S04: the platform-wide price list (read side).
// M25-S08: the Subscription and BillingAccount aggregates' repositories (consumed by S11/S13/S15b).
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeaturePriceEntity,
      FeaturePriceVersionEntity,
      SubscriptionEntity,
      SubscriptionItemEntity,
      BillingAccountEntity,
    ]),
  ],
  providers: [
    { provide: FEATURE_PRICE_REPOSITORY, useClass: TypeOrmFeaturePriceRepository },
    { provide: SUBSCRIPTION_REPOSITORY, useClass: TypeOrmSubscriptionRepository },
    { provide: BILLING_ACCOUNT_REPOSITORY, useClass: TypeOrmBillingAccountRepository },
    GetFeaturePriceAtUseCase,
    ListSelectablePricesUseCase,
  ],
  // Consumed in-process by M26's charge issuer and price page; export them then, not before.
  exports: [],
})
export class BillingModule {}
