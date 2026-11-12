import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FEATURE_PRICE_REPOSITORY } from './application/ports/feature-price-repository.port';
import {
  BILLING_PROVISIONING_CONFIG,
  type BillingProvisioningConfig,
} from './application/ports/billing-provisioning-config.port';
import { CreateTrialSubscriptionUseCase } from './application/use-cases/create-trial-subscription.use-case';
import { TenantProvisionedBillingHandler } from './infrastructure/events/tenant-provisioned-billing.handler';
import { GetFeaturePriceAtUseCase } from './application/use-cases/get-feature-price-at.use-case';
import { ListSelectablePricesUseCase } from './application/use-cases/list-selectable-prices.use-case';
import { BILLING_ACCOUNT_REPOSITORY } from './application/ports/billing-account-repository.port';
import { SUBSCRIPTION_REPOSITORY } from './application/ports/subscription-repository.port';
import { BillingAccountEntity } from './infrastructure/entities/billing-account.entity';
import { FeaturePriceVersionEntity } from './infrastructure/entities/feature-price-version.entity';
import { FeaturePriceEntity } from './infrastructure/entities/feature-price.entity';
import { SubscriptionItemEntity } from './infrastructure/entities/subscription-item.entity';
import { SubscriptionEntity } from './infrastructure/entities/subscription.entity';
import { SIGNUP_REGISTRATION_LOCK } from './application/ports/signup-registration-lock.port';
import { SIGNUP_REGISTRATION_REPOSITORY } from './application/ports/signup-registration-repository.port';
import { ReserveSignupRegistrationUseCase } from './application/use-cases/reserve-signup-registration.use-case';
import { InternalBillingRegistrationController } from './infrastructure/controllers/internal-billing-registration.controller';
import { SignupRegistrationEntity } from './infrastructure/entities/signup-registration.entity';
import { TypeOrmSignupRegistrationLockAdapter } from './infrastructure/locks/typeorm-signup-registration-lock.adapter';
import { TypeOrmSignupRegistrationRepository } from './infrastructure/repositories/typeorm-signup-registration.repository';
import { TypeOrmBillingAccountRepository } from './infrastructure/repositories/typeorm-billing-account.repository';
import { TypeOrmFeaturePriceRepository } from './infrastructure/repositories/typeorm-feature-price.repository';
import { TypeOrmSubscriptionRepository } from './infrastructure/repositories/typeorm-subscription.repository';
import { type AppEnv, resolveAppEnv } from '../../shared/database/resolve-app-env';
import { SharedCacheModule } from '../../shared/infrastructure/cache/shared-cache.module';
import { TENANT_ACCESS_PORT } from '../../shared/ports/tenant-access.port';
import { PlatformSettingsModule } from '../platform/platform-settings.module';
import { BILLING_PLATFORM_PORT } from './application/ports/billing-platform.port';
import { TENANT_ACCESS_CACHE_INVALIDATOR } from './application/ports/tenant-access-cache-invalidator.port';
import { GetTenantAccessUseCase } from './application/use-cases/get-tenant-access.use-case';
import { ListSuspendedTenantIdsUseCase } from './application/use-cases/list-suspended-tenant-ids.use-case';
import { ListTenantIdsNotEntitledToUseCase } from './application/use-cases/list-tenant-ids-not-entitled-to.use-case';
import { CachingTenantAccessAdapter } from './infrastructure/adapters/caching-tenant-access.adapter';
import { TenantAccessCacheInvalidatorAdapter } from './infrastructure/adapters/tenant-access-cache-invalidator.adapter';
import { BillingPlatformAdapter } from './infrastructure/cross-context/billing-platform.adapter';
import { InternalBillingAccessController } from './infrastructure/controllers/internal-billing-access.controller';
import { BILLING_PROVIDER_REGISTRY } from './application/ports/billing-provider.port';
import {
  BILLING_APP_ENV,
  BillingProviderRegistry,
} from './infrastructure/providers/billing-provider.registry';
import { FakeBillingProvider } from './infrastructure/providers/fake-billing.provider';

// Billing context (Ikaro charging its tenants). Each aggregate story registers its own
// repositories, use cases and controllers here. M25-S04: the platform-wide price list (read side).
// The Subscription and BillingAccount repositories are consumed by M25-S11 (the trial handler), S13 and S15b.
// `@Global()` so every context injects `TENANT_ACCESS_PORT` without importing Billing; `@Global()`
// alone exports nothing, so the token is listed in `exports:` (CLAUDE.md §8). The only import edge
// is BillingModule -> PlatformSettingsModule (the lighter Platform module Booking also imports).
@Global()
@Module({
  imports: [
    PlatformSettingsModule,
    SharedCacheModule,
    TypeOrmModule.forFeature([
      FeaturePriceEntity,
      FeaturePriceVersionEntity,
      SubscriptionEntity,
      SubscriptionItemEntity,
      BillingAccountEntity,
      SignupRegistrationEntity,
    ]),
  ],
  controllers: [InternalBillingRegistrationController, InternalBillingAccessController],
  providers: [
    { provide: SIGNUP_REGISTRATION_REPOSITORY, useClass: TypeOrmSignupRegistrationRepository },
    { provide: SIGNUP_REGISTRATION_LOCK, useClass: TypeOrmSignupRegistrationLockAdapter },
    ReserveSignupRegistrationUseCase,
    { provide: FEATURE_PRICE_REPOSITORY, useClass: TypeOrmFeaturePriceRepository },
    { provide: SUBSCRIPTION_REPOSITORY, useClass: TypeOrmSubscriptionRepository },
    { provide: BILLING_ACCOUNT_REPOSITORY, useClass: TypeOrmBillingAccountRepository },
    { provide: BILLING_APP_ENV, useFactory: () => resolveAppEnv(process.env) },
    FakeBillingProvider,
    { provide: BILLING_PROVIDER_REGISTRY, useClass: BillingProviderRegistry },
    GetFeaturePriceAtUseCase,
    ListSelectablePricesUseCase,
    // APP_ENV and the owner slug are fixed for the life of the process: one plain value, read once.
    // `appEnv` is the module's own `BILLING_APP_ENV`, so Billing has a single source for it.
    {
      provide: BILLING_PROVISIONING_CONFIG,
      inject: [ConfigService, BILLING_APP_ENV],
      useFactory: (config: ConfigService, appEnv: AppEnv): BillingProvisioningConfig => ({
        appEnv,
        platformOwnerSlug: config.get<string>('PLATFORM_OWNER_TENANT_SLUG') ?? null,
      }),
    },
    { provide: BILLING_PLATFORM_PORT, useClass: BillingPlatformAdapter },
    { provide: TENANT_ACCESS_CACHE_INVALIDATOR, useClass: TenantAccessCacheInvalidatorAdapter },
    GetTenantAccessUseCase,
    ListSuspendedTenantIdsUseCase,
    ListTenantIdsNotEntitledToUseCase,
    { provide: TENANT_ACCESS_PORT, useClass: CachingTenantAccessAdapter },
    CreateTrialSubscriptionUseCase,
    TenantProvisionedBillingHandler,
  ],
  // The shared access port is consumed by every context (M25-S16 onwards). The registration use
  // case is injected by this module's own controller, which the `global-module-export-pairing`
  // detector counts as an external consumer once the module is @Global(). The rest are consumed
  // in-process by M26's charge issuer and price page; export them then, not before.
  exports: [TENANT_ACCESS_PORT, ReserveSignupRegistrationUseCase],
})
export class BillingModule {}
