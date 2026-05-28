import { Inject, Injectable } from '@nestjs/common';
import { IEventBus, EVENT_BUS } from '../../../../../shared/ports/event-bus.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../../shared/ports/transaction-manager.port';
import { LoyaltyBalance } from '../../../domain/loyalty-balance.aggregate';
import { LoyaltyEntry } from '../../../domain/loyalty-entry.aggregate';
import {
  ILoyaltyBalanceRepository,
  LOYALTY_BALANCE_REPOSITORY,
} from '../../ports/loyalty-balance-repository.port';
import {
  ILoyaltyEntryRepository,
  LOYALTY_ENTRY_REPOSITORY,
} from '../../ports/loyalty-entry-repository.port';
import {
  ILoyaltyTenantSettingsPort,
  LOYALTY_TENANT_SETTINGS_PORT,
} from '../../ports/loyalty-tenant-settings.port';
import {
  IProcessedEventRepository,
  PROCESSED_EVENT_REPOSITORY,
} from '../../ports/processed-event-repository.port';

export interface BookingCompletedLine {
  lineId: string;
  serviceId: string;
  pointsValueAtBooking: number;
}

export interface RecordLoyaltyEntriesDto {
  tenantId: string;
  eventId: string;
  correlationId: string;
  customerId: string | null;
  bookingId: string;
  lines: BookingCompletedLine[];
}

export interface RecordLoyaltyEntriesResult {
  skipped: boolean;
  entriesCreated: number;
  totalPointsEarned: number;
}

@Injectable()
export class RecordLoyaltyEntriesUseCase {
  static readonly CONSUMER_NAME = 'RECORD_LOYALTY_ENTRY';

  constructor(
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
    @Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balanceRepo: ILoyaltyBalanceRepository,
    @Inject(PROCESSED_EVENT_REPOSITORY)
    private readonly processedEventRepo: IProcessedEventRepository,
    @Inject(LOYALTY_TENANT_SETTINGS_PORT)
    private readonly tenantSettingsPort: ILoyaltyTenantSettingsPort,
    @Inject(EVENT_BUS) private readonly eventBus: IEventBus,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(dto: RecordLoyaltyEntriesDto): Promise<RecordLoyaltyEntriesResult> {
    if (
      await this.processedEventRepo.hasBeenProcessed(
        dto.eventId,
        RecordLoyaltyEntriesUseCase.CONSUMER_NAME,
      )
    ) {
      return { skipped: true, entriesCreated: 0, totalPointsEarned: 0 };
    }

    if (dto.customerId === null) {
      return { skipped: true, entriesCreated: 0, totalPointsEarned: 0 };
    }

    const { expiryDays } = await this.tenantSettingsPort.getLoyaltySettings(dto.tenantId);

    const entries: LoyaltyEntry[] = dto.lines.map((line) =>
      LoyaltyEntry.record({
        tenantId: dto.tenantId,
        customerId: dto.customerId as string,
        bookingId: dto.bookingId,
        bookingLineId: line.lineId,
        serviceId: line.serviceId,
        points: line.pointsValueAtBooking,
        expiryDays,
        correlationId: dto.correlationId,
      }),
    );

    const totalPointsEarned = entries.reduce((sum, e) => sum + e.points, 0);

    const balance =
      (await this.balanceRepo.findByCustomer(dto.tenantId, dto.customerId)) ??
      LoyaltyBalance.create(dto.tenantId, dto.customerId);

    balance.increment(totalPointsEarned);

    await this.txManager.run(async () => {
      for (const entry of entries) {
        await this.entryRepo.save(entry);
      }
      await this.balanceRepo.upsert(balance);
      await this.processedEventRepo.markProcessed(
        dto.eventId,
        RecordLoyaltyEntriesUseCase.CONSUMER_NAME,
      );
    });

    for (const entry of entries) {
      const events = entry.clearDomainEvents();
      for (const event of events) {
        await this.eventBus.publish(event);
      }
    }

    return { skipped: false, entriesCreated: entries.length, totalPointsEarned };
  }
}
