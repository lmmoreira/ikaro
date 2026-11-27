import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FEATURE_PRICE_REPOSITORY } from './application/ports/feature-price-repository.port';
import { BILLING_PROVISIONING_CONFIG_PROVIDER } from './infrastructure/config/billing-config.providers';
import { GetSignupEligibilityUseCase } from './application/use-cases/get-signup-eligibility.use-case';
import { ReleaseSignupRegistrationUseCase } from './application/use-cases/release-signup-registration.use-case';
import { CreateTrialSubscriptionUseCase } from './application/use-cases/create-trial-subscription.use-case';
import { TenantProvisionedBillingHandler } from './infrastructure/events/tenant-provisioned-billing.handler';
import { GetFeaturePriceAtUseCase } from './application/use-cases/get-feature-price-at.use-case';
import { ListSelectablePricesUseCase } from './application/use-cases/list-selectable-prices.use-case';
import { BILLING_ACCOUNT_REPOSITORY } from './application/ports/billing-account-repository.port';
import { OPERATOR_AUDIT_REPOSITORY } from './application/ports/operator-audit-repository.port';
import { OperatorAuditEntity } from './infrastructure/entities/operator-audit.entity';
import { TypeOrmOperatorAuditRepository } from './infrastructure/repositories/typeorm-operator-audit.repository';
import { CHARGE_REPOSITORY } from './application/ports/charge-repository.port';
import { PROVIDER_EVENT_REPOSITORY } from './application/ports/provider-event-repository.port';
import { SUBSCRIPTION_REPOSITORY } from './application/ports/subscription-repository.port';
import { BillingAccountEntity } from './infrastructure/entities/billing-account.entity';
import { ChargeLineEntity } from './infrastructure/entities/charge-line.entity';
import { ChargeEntity } from './infrastructure/entities/charge.entity';
import { ProviderEventEntity } from './infrastructure/entities/provider-event.entity';
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
import { TypeOrmChargeRepository } from './infrastructure/repositories/typeorm-charge.repository';
import { TypeOrmProviderEventRepository } from './infrastructure/repositories/typeorm-provider-event.repository';
import { TypeOrmFeaturePriceRepository } from './infrastructure/repositories/typeorm-feature-price.repository';
import { CachingSubscriptionRepository } from './infrastructure/repositories/caching-subscription.repository';
import { TypeOrmSubscriptionRepository } from './infrastructure/repositories/typeorm-subscription.repository';
import { resolveAppEnv } from '../../shared/database/resolve-app-env';
import { ApplicationConfigModule } from '../../shared/infrastructure/application-config.module';
import { AuditLogModule } from '../../shared/infrastructure/audit-log/audit-log.module';
import { SharedCacheModule } from '../../shared/infrastructure/cache/shared-cache.module';
import { RequestModule } from '../../shared/request/request.module';
import { TENANT_ACCESS_PORT } from '../../shared/ports/tenant-access.port';
import { BookingFeatureRemovalModule } from '../booking/booking-feature-removal.module';
import { PlatformSettingsModule } from '../platform/platform-settings.module';
import { BILLING_BOOKING_PORT } from './application/ports/billing-booking.port';
import { BILLING_PLATFORM_PORT } from './application/ports/billing-platform.port';
import { GetBookableUntilUseCase } from './application/use-cases/get-bookable-until.use-case';
import { GetTenantAccessUseCase } from './application/use-cases/get-tenant-access.use-case';
import { ListSuspendedTenantIdsUseCase } from './application/use-cases/list-suspended-tenant-ids.use-case';
import { ListTenantIdsNotEntitledToUseCase } from './application/use-cases/list-tenant-ids-not-entitled-to.use-case';
import { TenantAccessAdapter } from './infrastructure/adapters/tenant-access.adapter';
import { BillingBookingAdapter } from './infrastructure/cross-context/billing-booking.adapter';
import { BillingPlatformAdapter } from './infrastructure/cross-context/billing-platform.adapter';
import { ExtendGraceUseCase } from './application/use-cases/extend-grace.use-case';
import { ListTenantBillingStatusUseCase } from './application/use-cases/list-tenant-billing-status.use-case';
import { SetTenantExemptUseCase } from './application/use-cases/set-tenant-exempt.use-case';
import { SuspendTenantByOperatorUseCase } from './application/use-cases/suspend-tenant-by-operator.use-case';
import { UnsuspendTenantUseCase } from './application/use-cases/unsuspend-tenant.use-case';
import { BillingAuditLogHandler } from './infrastructure/events/billing-audit-log.handler';
import { InternalBillingOperatorController } from './infrastructure/controllers/internal-billing-operator.controller';
import { ApplyChargeFactService } from './application/services/apply-charge-fact.service';
import { ProcessProviderWebhookUseCase } from './application/use-cases/process-provider-webhook.use-case';
import { ProviderWebhookProcessor } from './application/services/provider-webhook-processor.service';
import { InternalBillingWebhookController } from './infrastructure/controllers/internal-billing-webhook.controller';
import { IssueChargeForSubscriptionUseCase } from './application/use-cases/issue-charge-for-subscription.use-case';
import { IssueNextChargesJob } from './application/jobs/issue-next-charges.job';
import { RetryPendingChargeCreationUseCase } from './application/use-cases/retry-pending-charge-creation.use-case';
import { ProviderChargeCreationService } from './application/services/provider-charge-creation.service';
import { CronBillingController } from './infrastructure/controllers/cron-billing.controller';
import { IssueNextChargesTriggerHandler } from './infrastructure/events/issue-next-charges-trigger.handler';
import { PROVIDER_HEALTH_REPOSITORY } from './application/ports/provider-health-repository.port';
import { SweepSubscriptionStatusesJob } from './application/jobs/sweep-subscription-statuses.job';
import { ProviderChargeCancellationService } from './application/services/provider-charge-cancellation.service';
import { SweepOneSubscriptionUseCase } from './application/use-cases/sweep-one-subscription.use-case';
import { PurgeProviderEventsUseCase } from './application/use-cases/purge-provider-events.use-case';
import { PublishSubscriptionRemindersUseCase } from './application/use-cases/publish-subscription-reminders.use-case';
import { RecoveryChargePlanner } from './application/services/recovery-charge-planner.service';
import { SubscriptionSweepRules } from './application/services/subscription-sweep-rules.service';
import { ProviderHealthEntity } from './infrastructure/entities/provider-health.entity';
import { StatusSweepTriggerHandler } from './infrastructure/events/status-sweep-trigger.handler';
import { ReconcileChargesJob } from './application/jobs/reconcile-charges.job';
import { PublishBillingRemindersJob } from './application/jobs/publish-billing-reminders.job';
import { SelfHealJob } from './application/jobs/self-heal.job';
import { CheckProviderHealthUseCase } from './application/use-cases/check-provider-health.use-case';
import { EvaluateSuspensionFreezeUseCase } from './application/use-cases/evaluate-suspension-freeze.use-case';
import { ReleaseStaleSignupRegistrationsUseCase } from './application/use-cases/release-stale-signup-registrations.use-case';
import { RepairMissingSubscriptionsStep } from './application/jobs/repair-missing-subscriptions.helpers';
import { ProviderEventsPurgeTriggerHandler } from './infrastructure/events/provider-events-purge-trigger.handler';
import { RemindersTriggerHandler } from './infrastructure/events/reminders-trigger.handler';
import { SelfHealTriggerHandler } from './infrastructure/events/self-heal-trigger.handler';
import { ChargeProviderSyncService } from './application/services/charge-provider-sync.service';
import { ProviderAccountsService } from './application/services/provider-accounts.service';
import { ReconcileOneChargeUseCase } from './application/use-cases/reconcile-one-charge.use-case';
import { RecordReconcilePassUseCase } from './application/use-cases/record-reconcile-pass.use-case';
import { GetOrRegenerateChargePaymentLinkUseCase } from './application/use-cases/get-or-regenerate-charge-payment-link.use-case';
import { RecordPaymentReturnUseCase } from './application/use-cases/record-payment-return.use-case';
import { GetBillingIdentityUseCase } from './application/use-cases/get-billing-identity.use-case';
import { UpdateBillingIdentityUseCase } from './application/use-cases/update-billing-identity.use-case';
import { RetryProviderChargeCancelUseCase } from './application/use-cases/retry-provider-charge-cancel.use-case';
import { ReconcileTriggerHandler } from './infrastructure/events/reconcile-trigger.handler';
import { TypeOrmProviderHealthRepository } from './infrastructure/repositories/typeorm-provider-health.repository';
import { InternalBillingAccessController } from './infrastructure/controllers/internal-billing-access.controller';
import { InternalBillingPricesController } from './infrastructure/controllers/internal-billing-prices.controller';
import { BillingController } from './infrastructure/controllers/billing.controller';
import { GetBillingSummaryUseCase } from './application/use-cases/get-billing-summary.use-case';
import { GetPlanCatalogUseCase } from './application/use-cases/get-plan-catalog.use-case';
import { ListBillingChargesUseCase } from './application/use-cases/list-billing-charges.use-case';
import { PreviewPlanSelectionUseCase } from './application/use-cases/preview-plan-selection.use-case';
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
// alone exports nothing, so the token is listed in `exports:` (CLAUDE.md §8). The import edges
// are BillingModule -> PlatformSettingsModule (the lighter Platform module Booking also imports)
// and BillingModule -> BookingFeatureRemovalModule (M26-S18a, the lighter Booking module: only the
// read-only BOOKING-removal guard, never Booking's entities or handlers).
@Global()
@Module({
  imports: [
    ApplicationConfigModule,
    PlatformSettingsModule,
    BookingFeatureRemovalModule,
    SharedCacheModule,
    AuditLogModule,
    // `RequestContext` for the manager's billing controller (M26-S14): the tenant of the caller.
    RequestModule,
    TypeOrmModule.forFeature([
      FeaturePriceEntity,
      FeaturePriceVersionEntity,
      SubscriptionEntity,
      SubscriptionItemEntity,
      BillingAccountEntity,
      SignupRegistrationEntity,
      OperatorAuditEntity,
      ChargeEntity,
      ChargeLineEntity,
      ProviderEventEntity,
      ProviderHealthEntity,
    ]),
  ],
  controllers: [
    InternalBillingRegistrationController,
    InternalBillingAccessController,
    InternalBillingPricesController,
    InternalBillingOperatorController,
    InternalBillingWebhookController,
    CronBillingController,
    BillingController,
  ],
  providers: [
    { provide: SIGNUP_REGISTRATION_REPOSITORY, useClass: TypeOrmSignupRegistrationRepository },
    { provide: SIGNUP_REGISTRATION_LOCK, useClass: TypeOrmSignupRegistrationLockAdapter },
    ReserveSignupRegistrationUseCase,
    GetSignupEligibilityUseCase,
    ReleaseSignupRegistrationUseCase,
    { provide: FEATURE_PRICE_REPOSITORY, useClass: TypeOrmFeaturePriceRepository },
    // The cached layer: every reader of the subscription (the access resolver, the shared port, any
    // later use case) goes through the decorator; the concrete adapter is its inner repository.
    TypeOrmSubscriptionRepository,
    CachingSubscriptionRepository,
    { provide: SUBSCRIPTION_REPOSITORY, useClass: CachingSubscriptionRepository },
    { provide: BILLING_ACCOUNT_REPOSITORY, useClass: TypeOrmBillingAccountRepository },
    // The money model (M26-S02): consumed by the M26 use cases (S04 onwards).
    { provide: CHARGE_REPOSITORY, useClass: TypeOrmChargeRepository },
    { provide: PROVIDER_EVENT_REPOSITORY, useClass: TypeOrmProviderEventRepository },
    // Platform-wide, one row per merchant profile key: read by the status sweep's freeze lookup,
    // written by reconcile and self-heal (M26-S07, S08).
    { provide: PROVIDER_HEALTH_REPOSITORY, useClass: TypeOrmProviderHealthRepository },
    // Written by the operator use cases (M25-S15b), in the same transaction as the change they audit.
    { provide: OPERATOR_AUDIT_REPOSITORY, useClass: TypeOrmOperatorAuditRepository },
    { provide: BILLING_APP_ENV, useFactory: () => resolveAppEnv(process.env) },
    FakeBillingProvider,
    { provide: BILLING_PROVIDER_REGISTRY, useClass: BillingProviderRegistry },
    GetFeaturePriceAtUseCase,
    ListSelectablePricesUseCase,
    BILLING_PROVISIONING_CONFIG_PROVIDER,
    { provide: BILLING_PLATFORM_PORT, useClass: BillingPlatformAdapter },
    { provide: BILLING_BOOKING_PORT, useClass: BillingBookingAdapter },
    GetTenantAccessUseCase,
    GetBookableUntilUseCase,
    ListSuspendedTenantIdsUseCase,
    ListTenantIdsNotEntitledToUseCase,
    { provide: TENANT_ACCESS_PORT, useClass: TenantAccessAdapter },
    CreateTrialSubscriptionUseCase,
    TenantProvisionedBillingHandler,
    SuspendTenantByOperatorUseCase,
    UnsuspendTenantUseCase,
    ExtendGraceUseCase,
    SetTenantExemptUseCase,
    ListTenantBillingStatusUseCase,
    BillingAuditLogHandler,
    // The provider webhook (M26-S04): the use case the controller calls and the shared service
    // that writes a verified paid / refunded / charged-back fact.
    RecoveryChargePlanner,
    ApplyChargeFactService,
    ProviderWebhookProcessor,
    ProcessProviderWebhookUseCase,
    // The charge issue job (M26-S05): the shared creation step, the per-subscription issue, the
    // creation retry, the job and its daily trigger handler.
    ProviderChargeCreationService,
    IssueChargeForSubscriptionUseCase,
    RetryPendingChargeCreationUseCase,
    IssueNextChargesJob,
    IssueNextChargesTriggerHandler,
    // The status sweep (M26-S06): the rules for one subscription, the provider-side cancel the
    // later cancel stories share, the per-subscription use case, the hourly job and its trigger.
    SubscriptionSweepRules,
    ProviderChargeCancellationService,
    SweepOneSubscriptionUseCase,
    SweepSubscriptionStatusesJob,
    StatusSweepTriggerHandler,
    ChargeProviderSyncService,
    ReconcileOneChargeUseCase,
    RecordReconcilePassUseCase,
    RetryProviderChargeCancelUseCase,
    ProviderAccountsService,
    ReconcileChargesJob,
    ReconcileTriggerHandler,
    RepairMissingSubscriptionsStep,
    ReleaseStaleSignupRegistrationsUseCase,
    CheckProviderHealthUseCase,
    EvaluateSuspensionFreezeUseCase,
    SelfHealJob,
    SelfHealTriggerHandler,
    PublishSubscriptionRemindersUseCase,
    PublishBillingRemindersJob,
    RemindersTriggerHandler,
    PurgeProviderEventsUseCase,
    ProviderEventsPurgeTriggerHandler,
    // The manager's billing page reads (M26-S14).
    GetBillingSummaryUseCase,
    ListBillingChargesUseCase,
    GetPlanCatalogUseCase,
    PreviewPlanSelectionUseCase,
    // Paying a charge (M26-S15).
    GetOrRegenerateChargePaymentLinkUseCase,
    RecordPaymentReturnUseCase,
    // The billing identity read and save (M26-S16).
    GetBillingIdentityUseCase,
    UpdateBillingIdentityUseCase,
  ],
  // The shared access port is consumed by every context (M25-S16 onwards). The registration and
  // the five operator use cases are injected by this module's own controllers, which the
  // `global-module-export-pairing` detector counts as external consumers once the module is
  // @Global(). The rest are consumed in-process by M26's charge issuer and price page; export them
  // then, not before.
  exports: [
    TENANT_ACCESS_PORT,
    ReserveSignupRegistrationUseCase,
    GetSignupEligibilityUseCase,
    ReleaseSignupRegistrationUseCase,
    SuspendTenantByOperatorUseCase,
    UnsuspendTenantUseCase,
    ExtendGraceUseCase,
    SetTenantExemptUseCase,
    ListTenantBillingStatusUseCase,
    // Injected by this module's own `BillingController` (M26-S14), which the detector counts as external.
    GetBillingSummaryUseCase,
    ListBillingChargesUseCase,
    GetPlanCatalogUseCase,
    PreviewPlanSelectionUseCase,
    GetOrRegenerateChargePaymentLinkUseCase,
    RecordPaymentReturnUseCase,
    GetBillingIdentityUseCase,
    UpdateBillingIdentityUseCase,
    // Injected by this module's own `InternalBillingPricesController` (M26-S23), which the detector counts as external.
    ListSelectablePricesUseCase,
    ProcessProviderWebhookUseCase,
    ProviderWebhookProcessor,
    // Consumed by `DevBillingModule`, which exists only outside production.
    CHARGE_REPOSITORY,
    FakeBillingProvider,
  ],
})
export class BillingModule {}
