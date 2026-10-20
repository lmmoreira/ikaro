import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import { forEachTenantInWindow, LocalTimeWindow } from './tenant-local-window.helpers';

export interface WindowedTenant {
  id: string;
  timezone: string;
}

// The shape every per-tenant, local-time-window cron job shares: list the active tenants, run the
// work for each one that is inside its window, and fail the run after every tenant was tried (see
// forEachTenantInWindow). It owns the tenant port and `run()`; a job supplies only what differs: its
// window, its log label and what it does for one tenant. The class carries its own constructor, so
// Nest resolves the port from this class's parameter metadata.
@Injectable()
export abstract class WindowedTenantJob {
  protected readonly logger = new AppLogger(this.constructor.name);

  protected abstract readonly window: LocalTimeWindow;
  protected abstract readonly label: string;
  protected abstract processTenant(tenant: WindowedTenant, now: Date): Promise<void>;

  constructor(@Inject(BOOKING_PLATFORM_PORT) protected readonly tenantPort: IBookingPlatformPort) {}

  async run(now: Date = new Date()): Promise<void> {
    const tenants = await this.tenantPort.findAllActive();
    await forEachTenantInWindow(
      tenants,
      now,
      this.window,
      { logger: this.logger, label: this.label },
      (tenant) => this.processTenant(tenant, now),
    );
  }
}
