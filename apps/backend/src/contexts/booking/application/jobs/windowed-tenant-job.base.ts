import { Injectable } from '@nestjs/common';
import {
  localTimeWindow,
  type LocalTimeWindow,
} from '../../../../shared/application/jobs/local-time-window';
import { TenantJobRunner } from '../../../../shared/application/jobs/tenant-job-runner';
import type { ActiveTenant } from '../../../../shared/ports/tenant-directory.port';

export type WindowedTenant = ActiveTenant;

// The shape the Booking jobs that send something to customers or staff share: run the work for
// each tenant that is inside its local window, is operational and has BOOKING (see
// TenantJobRunner). A job supplies only what differs: its window, its log label and what it does
// for one tenant. The class carries its own constructor, so Nest resolves the runner from this
// class's parameter metadata.
@Injectable()
export abstract class WindowedTenantJob {
  protected abstract readonly window: LocalTimeWindow;
  protected abstract readonly label: string;
  protected abstract processTenant(tenant: WindowedTenant, now: Date): Promise<void>;

  constructor(protected readonly tenantRunner: TenantJobRunner) {}

  async run(now: Date = new Date()): Promise<void> {
    await this.tenantRunner.forEachTenant(
      { label: this.label, requires: 'BOOKING', isDue: localTimeWindow(this.window) },
      now,
      (tenant) => this.processTenant(tenant, now),
    );
  }
}
