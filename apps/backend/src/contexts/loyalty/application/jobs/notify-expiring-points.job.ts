import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { utcDateString } from '../../../../shared/utils/calendar-date';
import { publishToOutboxInChunks } from '../../../../shared/utils/publish-to-outbox-in-chunks';
import { mapSequentiallyIsolated } from '../../../../shared/utils/sequential-isolated';
import { PointsExpiringSoon } from '../../domain/commands/points-expiring-soon.command';
import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import { ILoyaltyPlatformPort, LOYALTY_PLATFORM_PORT } from '../ports/loyalty-platform.port';
import {
  ILoyaltyEntryRepository,
  LOYALTY_ENTRY_REPOSITORY,
} from '../ports/loyalty-entry-repository.port';

const DEFAULT_EXPIRY_WARNING_DAYS = 7;

export interface NotifyExpiringPointsJobResult {
  customersNotified: number;
}

@Injectable()
export class NotifyExpiringPointsJob {
  private readonly logger = new AppLogger(NotifyExpiringPointsJob.name);

  constructor(
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
    @Inject(LOYALTY_PLATFORM_PORT) private readonly settingsPort: ILoyaltyPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async run(
    now: Date = new Date(),
    warningDays = DEFAULT_EXPIRY_WARNING_DAYS,
  ): Promise<NotifyExpiringPointsJobResult> {
    const correlationId = uuidv7();
    const runDate = utcDateString(now);
    const to = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);

    const entries = await this.entryRepo.findExpiringSoon(now, to);
    if (entries.length === 0) return { customersNotified: 0 };

    const groupsByTenant = this.groupByTenant(entries);
    // One tenant's failure (its settings read, its publish) does not stop the tenants after it; the
    // helper throws once at the end so the trigger is redelivered, and the outbox dedup keys make
    // the tenants that already published a no-op on the retry.
    const counts = await mapSequentiallyIsolated(
      [...groupsByTenant],
      ([tenantId, tenantGroups]) =>
        this.processTenant(tenantId, tenantGroups, correlationId, runDate),
      {
        onFailure: ([tenantId], err) =>
          this.logger.error(
            'NotifyExpiringPointsJob failed for a tenant — the run will be retried',
            err instanceof Error ? err.stack : String(err),
            { tenantId },
          ),
        summarize: (failed) =>
          `NotifyExpiringPointsJob failed for tenant(s): ${failed.map(([tenantId]) => tenantId).join(', ')}`,
      },
    );

    return { customersNotified: counts.reduce((sum, count) => sum + count, 0) };
  }

  /** Publishes PointsExpiringSoon for one tenant's qualifying customer groups, returning the count notified. */
  private async processTenant(
    tenantId: string,
    tenantGroups: LoyaltyEntry[][],
    correlationId: string,
    runDate: string,
  ): Promise<number> {
    const { notificationMinPoints } = await this.settingsPort.getLoyaltySettings(tenantId);

    const toPublish: PointsExpiringSoon[] = [];
    for (const group of tenantGroups) {
      const { customerId } = group[0];
      const pointsExpiringSoon = group.reduce((sum, e) => sum + e.points, 0);
      if (pointsExpiringSoon < notificationMinPoints) continue;

      const earliestExpiresAt = group
        .map((e) => e.expiresAt)
        .reduce((min, d) => new Date(Math.min(d.getTime(), min.getTime())), group[0].expiresAt);

      toPublish.push(
        new PointsExpiringSoon(
          tenantId,
          correlationId,
          { customerId, pointsExpiringSoon, earliestExpiresAt: earliestExpiresAt.toISOString() },
          runDate,
        ),
      );
    }

    // Bounded chunks per tenant (see booking-reminder.job.ts for the rationale).
    await publishToOutboxInChunks(
      { txManager: this.txManager, outboxPublisher: this.outboxPublisher },
      toPublish,
    );

    return toPublish.length;
  }

  private groupByTenant(entries: LoyaltyEntry[]): Map<string, LoyaltyEntry[][]> {
    const byCustomer = new Map<string, LoyaltyEntry[]>();
    for (const entry of entries) {
      const key = `${entry.tenantId}:${entry.customerId}`;
      const group = byCustomer.get(key) ?? [];
      group.push(entry);
      byCustomer.set(key, group);
    }

    const byTenant = new Map<string, LoyaltyEntry[][]>();
    for (const group of byCustomer.values()) {
      const tenantId = group[0].tenantId;
      const tenantGroups = byTenant.get(tenantId) ?? [];
      tenantGroups.push(group);
      byTenant.set(tenantId, tenantGroups);
    }
    return byTenant;
  }
}
