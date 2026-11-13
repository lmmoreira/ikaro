import { Inject, Injectable } from '@nestjs/common';
import type { FeatureKey } from '@ikaro/validation';
import { AppLogger } from '../../observability/app-logger';
import { TENANT_ACCESS_PORT, type TenantAccessPort } from '../../ports/tenant-access.port';
import {
  type ActiveTenant,
  type ITenantDirectoryPort,
  TENANT_DIRECTORY_PORT,
} from '../../ports/tenant-directory.port';
import { mapSequentially } from '../../utils/sequential';

export interface TenantJobOptions {
  label: string;
  // `operational` skips suspended tenants; `includingSuspended` is for data-maintenance crons.
  scope?: 'operational' | 'includingSuspended';
  // Every listed feature must be entitled. Billing enforces feature dependencies, so a job names
  // only the feature it delivers, never its prerequisites.
  requires?: FeatureKey | readonly FeatureKey[];
  // The job's schedule policy; a tenant that is not due is neither processed nor looked up.
  isDue?: (tenant: ActiveTenant, now: Date) => boolean;
}

interface Exclusions {
  suspended: ReadonlySet<string>;
  notEntitled: ReadonlyMap<FeatureKey, ReadonlySet<string>>;
}

type Outcome<R> = { ok: true; value: R } | { ok: false; tenantId: string };

const NO_EXCLUSIONS: Exclusions = { suspended: new Set(), notEntitled: new Map() };

// Runs a cron's work for every tenant that is due, operational and entitled: one tenant after
// another, so per-tenant transactions and locks never contend with each other. The runner opens
// no transaction and takes no lock; `work` keeps its own. A failure never stops the tenants after
// it, but it is not swallowed: after every tenant was tried the run throws once, which nacks the
// trigger message so Pub/Sub redelivers it (every job's work is idempotent).
@Injectable()
export class TenantJobRunner {
  private readonly logger = new AppLogger(TenantJobRunner.name);

  constructor(
    @Inject(TENANT_DIRECTORY_PORT) private readonly directory: ITenantDirectoryPort,
    @Inject(TENANT_ACCESS_PORT) private readonly access: TenantAccessPort,
  ) {}

  async forEachTenant<R>(
    options: TenantJobOptions,
    now: Date,
    work: (tenant: ActiveTenant) => Promise<R>,
  ): Promise<R[]> {
    const isDue = options.isDue ?? (() => true);
    const due = (await this.directory.listActiveTenants()).filter((tenant) => isDue(tenant, now));
    // Most ticks of a windowed job have no due tenant: skip the Billing reads then.
    if (due.length === 0) return [];

    const exclusions = await this.readExclusions(options);
    const runnable = due.filter((tenant) => !this.isExcluded(tenant, exclusions));
    this.logSkipped(options.label, due, exclusions);
    return this.runAll(options.label, runnable, work);
  }

  // Fails open, like `getAccess`: a failing Billing read must not stop every tenant's cron. The
  // cost is that one tick may process a suspended or unentitled tenant.
  private async readExclusions(options: TenantJobOptions): Promise<Exclusions> {
    try {
      const suspended =
        options.scope === 'includingSuspended' ? [] : await this.access.listSuspendedTenantIds();
      const features = toFeatureList(options.requires);
      const lists = await mapSequentially(features, (feature) =>
        this.access.findTenantIdsNotEntitledTo(feature),
      );
      return {
        suspended: new Set(suspended),
        notEntitled: new Map(features.map((feature, i) => [feature, new Set(lists[i])])),
      };
    } catch (err) {
      this.logger.error(
        `${options.label}: could not read tenant access, processing every due tenant`,
        err instanceof Error ? err.stack : String(err),
      );
      return NO_EXCLUSIONS;
    }
  }

  private isExcluded(tenant: ActiveTenant, exclusions: Exclusions): boolean {
    if (exclusions.suspended.has(tenant.id)) return true;
    return [...exclusions.notEntitled.values()].some((ids) => ids.has(tenant.id));
  }

  // One line per run, only when something was skipped, so a long-suspended tenant adds nothing to
  // a run that skipped nobody else.
  private logSkipped(label: string, due: readonly ActiveTenant[], exclusions: Exclusions): void {
    const dueIds = new Set(due.map((tenant) => tenant.id));
    const suspended = [...exclusions.suspended].filter((id) => dueIds.has(id));
    const notEntitled: Record<string, string[]> = {};
    for (const [feature, ids] of exclusions.notEntitled) {
      const skipped = [...ids].filter((id) => dueIds.has(id) && !exclusions.suspended.has(id));
      if (skipped.length > 0) notEntitled[feature] = skipped;
    }
    if (suspended.length === 0 && Object.keys(notEntitled).length === 0) return;
    this.logger.log(`${label}: skipped suspended or unentitled tenants`, {
      suspendedTenantIds: suspended,
      notEntitledTenantIds: notEntitled,
    });
  }

  private async runAll<R>(
    label: string,
    tenants: readonly ActiveTenant[],
    work: (tenant: ActiveTenant) => Promise<R>,
  ): Promise<R[]> {
    const outcomes = await mapSequentially(tenants, async (tenant): Promise<Outcome<R>> => {
      try {
        return { ok: true, value: await work(tenant) };
      } catch (err) {
        this.logger.error(
          `${label} failed for a tenant — the run will be retried`,
          err instanceof Error ? err.stack : String(err),
          { tenantId: tenant.id },
        );
        return { ok: false, tenantId: tenant.id };
      }
    });
    const failed = outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.tenantId]));
    if (failed.length > 0) {
      throw new Error(`${label} failed for tenant(s): ${failed.join(', ')}`);
    }
    return outcomes.flatMap((outcome) => (outcome.ok ? [outcome.value] : []));
  }
}

function toFeatureList(requires: TenantJobOptions['requires']): readonly FeatureKey[] {
  if (requires === undefined) return [];
  return typeof requires === 'string' ? [requires] : requires;
}
