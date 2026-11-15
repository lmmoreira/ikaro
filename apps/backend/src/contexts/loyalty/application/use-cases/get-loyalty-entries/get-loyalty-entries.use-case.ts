import { Inject, Injectable } from '@nestjs/common';
import {
  ILoyaltyEntryRepository,
  LOYALTY_ENTRY_REPOSITORY,
} from '../../ports/loyalty-entry-repository.port';
import { EntryEffectiveExpiryService } from '../../services/entry-effective-expiry.service';
import { ILoyaltyBookingPort, LOYALTY_BOOKING_PORT } from '../../ports/loyalty-booking.port';

export interface GetLoyaltyEntriesUseCaseInput {
  tenantId: string;
  customerId: string;
  page: number;
  limit: number;
}

export interface LoyaltyEntryItem {
  entryId: string;
  bookingId: string;
  serviceId: string;
  serviceName: string;
  points: number;
  earnedAt: string;
  expiresAt: string;
  isActive: boolean;
}

export interface GetLoyaltyEntriesUseCaseResult {
  entries: LoyaltyEntryItem[];
  pagination: { page: number; limit: number; total: number };
}

@Injectable()
export class GetLoyaltyEntriesUseCase {
  constructor(
    @Inject(LOYALTY_ENTRY_REPOSITORY) private readonly entryRepo: ILoyaltyEntryRepository,
    @Inject(LOYALTY_BOOKING_PORT) private readonly serviceCatalog: ILoyaltyBookingPort,
    private readonly effectiveExpiry: EntryEffectiveExpiryService,
  ) {}

  async execute(dto: GetLoyaltyEntriesUseCaseInput): Promise<GetLoyaltyEntriesUseCaseResult> {
    const { items, total } = await this.entryRepo.findByCustomerPaginated(
      dto.tenantId,
      dto.customerId,
      dto.page,
      dto.limit,
    );

    const serviceIds = [...new Set(items.map((e) => e.serviceId))];
    const services = await this.serviceCatalog.findServicesByIds(dto.tenantId, serviceIds);
    const nameMap = new Map(services.map((s) => [s.serviceId, s.serviceName]));

    const effective = await this.effectiveExpiry.resolve(items);
    const now = new Date();
    const entries: LoyaltyEntryItem[] = items.map((entry) => {
      // `null`: an open suspension pause holds the entry, so it is still active (M25-S27).
      const expiresAt = effective.get(entry.id) ?? null;
      return {
        entryId: entry.id,
        bookingId: entry.bookingId,
        serviceId: entry.serviceId,
        serviceName: nameMap.get(entry.serviceId) ?? entry.serviceId,
        points: entry.points,
        earnedAt: entry.earnedAt.toISOString(),
        expiresAt: (expiresAt ?? entry.expiresAt).toISOString(),
        isActive: expiresAt === null || expiresAt > now,
      };
    });

    return { entries, pagination: { page: dto.page, limit: dto.limit, total } };
  }
}
