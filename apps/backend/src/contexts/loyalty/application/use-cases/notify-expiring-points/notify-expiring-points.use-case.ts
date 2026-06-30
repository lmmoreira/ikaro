import { Inject, Injectable } from '@nestjs/common';
import { uuidv7 } from '../../../../../shared/domain/uuid-v7';
import { EVENT_BUS, IEventBus } from '../../../../../shared/ports/event-bus.port';
import { PointsExpiringSoon } from '../../../domain/events/points-expiring-soon.event';
import { LoyaltyEntry } from '../../../domain/loyalty-entry.aggregate';
import { ILoyaltyPlatformPort, LOYALTY_PLATFORM_PORT } from '../../ports/loyalty-platform.port';
import {
  ILoyaltyEntryRepository,
  LOYALTY_ENTRY_REPOSITORY,
} from '../../ports/loyalty-entry-repository.port';

const DEFAULT_EXPIRY_WARNING_DAYS = 7;

export interface NotifyExpiringPointsUseCaseResult {
  customersNotified: number;
}

@Injectable()
export class NotifyExpiringPointsUseCase {
  constructor(
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(LOYALTY_PLATFORM_PORT) private readonly settingsPort: ILoyaltyPlatformPort,
  ) {}

  async execute(warningDays = DEFAULT_EXPIRY_WARNING_DAYS): Promise<NotifyExpiringPointsUseCaseResult> {
    const correlationId = uuidv7();
    const now = new Date();
    const to = new Date(now.getTime() + warningDays * 24 * 60 * 60 * 1000);

    const entries = await this.entryRepo.findExpiringSoon(now, to);
    if (entries.length === 0) return { customersNotified: 0 };

    const groups = this.groupByTenantAndCustomer(entries);
    const tenantSettingsCache = new Map<string, { notificationMinPoints: number }>();
    let customersNotified = 0;

    for (const group of groups.values()) {
      const { tenantId, customerId } = group[0];
      const pointsExpiringSoon = group.reduce((sum, e) => sum + e.points, 0);

      if (!tenantSettingsCache.has(tenantId)) {
        const s = await this.settingsPort.getLoyaltySettings(tenantId);
        tenantSettingsCache.set(tenantId, { notificationMinPoints: s.notificationMinPoints });
      }
      const { notificationMinPoints } = tenantSettingsCache.get(tenantId)!;

      if (pointsExpiringSoon < notificationMinPoints) continue;

      const earliestExpiresAt = group
        .map((e) => e.expiresAt)
        .reduce((min, d) => new Date(Math.min(d.getTime(), min.getTime())), group[0].expiresAt);

      await this.eventBus.publish(
        new PointsExpiringSoon(tenantId, correlationId, {
          customerId,
          pointsExpiringSoon,
          earliestExpiresAt: earliestExpiresAt.toISOString(),
        }),
      );
      customersNotified++;
    }

    return { customersNotified };
  }

  private groupByTenantAndCustomer(entries: LoyaltyEntry[]): Map<string, LoyaltyEntry[]> {
    const groups = new Map<string, LoyaltyEntry[]>();
    for (const entry of entries) {
      const key = `${entry.tenantId}:${entry.customerId}`;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    return groups;
  }
}
