import { Provider } from '@nestjs/common';
import { RaiseTenantUnavailableNoticesUseCase } from './application/use-cases/raise-tenant-unavailable-notices.use-case';
import { SubscriptionSuspendedTenantUnavailableHandler } from './infrastructure/events/subscription-suspended-tenant-unavailable.handler';

// Split out of booking.module-providers.ts, which is at the file-length cap (the same split as
// availability-alert-matching.module-providers.ts).
export const tenantUnavailableNoticeProviders: Provider[] = [
  RaiseTenantUnavailableNoticesUseCase,
  SubscriptionSuspendedTenantUnavailableHandler,
];
