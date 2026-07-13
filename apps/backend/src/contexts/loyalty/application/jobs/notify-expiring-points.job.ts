import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { IOutboxPublisher, OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { utcDateString } from '../../../../shared/utils/calendar-date';
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
    let customersNotified = 0;

    for (const [tenantId, tenantGroups] of groupsByTenant) {
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
            {
              customerId,
              pointsExpiringSoon,
              earliestExpiresAt: earliestExpiresAt.toISOString(),
            },
            runDate,
          ),
        );
        customersNotified++;
      }

      // One transaction per tenant-batch (see booking-reminder.job.ts for the rationale).
      await this.txManager.run(async () => {
        for (const event of toPublish) {
          await this.outboxPublisher.publish(event);
        }
      });
    }

    return { customersNotified };
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
