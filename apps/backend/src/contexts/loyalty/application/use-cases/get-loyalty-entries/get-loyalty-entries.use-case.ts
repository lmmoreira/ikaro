import { Inject, Injectable } from '@nestjs/common';
import {
  ILoyaltyEntryRepository,
  LOYALTY_ENTRY_REPOSITORY,
} from '../../ports/loyalty-entry-repository.port';
import { ILoyaltyBookingPort, LOYALTY_BOOKING_PORT } from '../../ports/loyalty-booking.port';

export interface GetLoyaltyEntriesUseCaseInput {
  tenantId: string;
  customerId: string;
  page: number;
  limit: number;
}

export interface LoyaltyEntryItem {
  entryId: string;
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

    const now = new Date();
    const entries: LoyaltyEntryItem[] = items.map((entry) => ({
      entryId: entry.id,
      serviceId: entry.serviceId,
      serviceName: nameMap.get(entry.serviceId) ?? entry.serviceId,
      points: entry.points,
      earnedAt: entry.earnedAt.toISOString(),
      expiresAt: entry.expiresAt.toISOString(),
      isActive: entry.expiresAt > now,
    }));

    return { entries, pagination: { page: dto.page, limit: dto.limit, total } };
  }
}
