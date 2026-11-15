import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { utcDateString } from '../../../../shared/utils/calendar-date';
import { mapSequentially } from '../../../../shared/utils/sequential';
import { PointsExpiringSoon } from '../../domain/commands/points-expiring-soon.command';
import { LoyaltyEntry } from '../../domain/loyalty-entry.aggregate';
import { EntryEffectiveExpiryService } from '../services/entry-effective-expiry.service';
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
  constructor(
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
    @Inject(OUTBOX_PUBLISHER) private readonly outboxPublisher: IOutboxPublisher,
    @Inject(LOYALTY_PLATFORM_PORT) private readonly settingsPort: ILoyaltyPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    private readonly effectiveExpiry: EntryEffectiveExpiryService,
  ) {}

  async run(
    now: Date = new Date(),
    warningDays = DEFAULT_EXPIRY_WARNING_DAYS,
  ): Promise<NotifyExpiringPointsJobResult> {
    const correlationId = uuidv7();
    const runDate = utcDateString(now);
    const to = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);

    // The stored expiry is never later than the effective one, so every entry that expires in the
    // window is among those before `to`; the tenants' suspension pauses (M25-S27) then decide
    // which of them really expire inside it.
    const candidates = await this.entryRepo.findUnprocessedExpiringUntil(to);
    const effectiveByEntry = await this.effectiveExpiry.resolve(candidates);
    const entries = candidates.filter((entry) => {
      const expiresAt = effectiveByEntry.get(entry.id);
      return expiresAt != null && expiresAt >= now && expiresAt <= to;
    });
    if (entries.length === 0) return { customersNotified: 0 };

    const groupsByTenant = this.groupByTenant(entries);
    const counts = await mapSequentially([...groupsByTenant], ([tenantId, tenantGroups]) =>
      this.processTenant(tenantId, tenantGroups, effectiveByEntry, correlationId, runDate),
    );

    return { customersNotified: counts.reduce((sum, count) => sum + count, 0) };
  }

  /** Publishes PointsExpiringSoon for one tenant's qualifying customer groups, returning the count notified. */
  private async processTenant(
    tenantId: string,
    tenantGroups: LoyaltyEntry[][],
    effectiveByEntry: ReadonlyMap<string, Date | null>,
    correlationId: string,
    runDate: string,
  ): Promise<number> {
    const { notificationMinPoints } = await this.settingsPort.getLoyaltySettings(tenantId);

    const toPublish: PointsExpiringSoon[] = [];
    for (const group of tenantGroups) {
      const { customerId } = group[0];
      const pointsExpiringSoon = group.reduce((sum, e) => sum + e.points, 0);
      if (pointsExpiringSoon < notificationMinPoints) continue;

      const earliestExpiresAt = new Date(
        Math.min(...group.map((e) => (effectiveByEntry.get(e.id) as Date).getTime())),
      );

      toPublish.push(
        new PointsExpiringSoon(
          tenantId,
          correlationId,
          { customerId, pointsExpiringSoon, earliestExpiresAt: earliestExpiresAt.toISOString() },
          runDate,
        ),
      );
    }

    // One transaction per tenant-batch (see booking-reminder.job.ts for the rationale).
    await this.txManager.run(async () => {
      await mapSequentially(toPublish, (event) => this.outboxPublisher.publish(event));
    });

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
