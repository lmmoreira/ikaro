import { Inject, Injectable } from '@nestjs/common';
import {
  ILoyaltyRedemptionRepository,
  LOYALTY_REDEMPTION_REPOSITORY,
} from '../../ports/loyalty-redemption-repository.port';
import {
  ILoyaltyBookingPort,
  LOYALTY_BOOKING_PORT,
  ServiceSummary,
} from '../../ports/loyalty-booking.port';

export interface GetLoyaltyRedemptionsDto {
  tenantId: string;
  customerId: string;
  page: number;
  limit: number;
}

export interface LoyaltyRedemptionItem {
  redemptionId: string;
  pointsRedeemed: number;
  redeemedAt: string;
  notes: string | null;
  bookingServices: ServiceSummary[];
}

export interface GetLoyaltyRedemptionsResult {
  redemptions: LoyaltyRedemptionItem[];
  pagination: { page: number; limit: number; total: number };
}

@Injectable()
export class GetLoyaltyRedemptionsUseCase {
  constructor(
    @Inject(LOYALTY_REDEMPTION_REPOSITORY)
    private readonly redemptionRepo: ILoyaltyRedemptionRepository,
    @Inject(LOYALTY_BOOKING_PORT) private readonly bookingCatalog: ILoyaltyBookingPort,
  ) {}

  async execute(dto: GetLoyaltyRedemptionsDto): Promise<GetLoyaltyRedemptionsResult> {
    const { items, total } = await this.redemptionRepo.findByCustomer(
      dto.tenantId,
      dto.customerId,
      dto.page,
      dto.limit,
    );

    const redemptions: LoyaltyRedemptionItem[] = await Promise.all(
      items.map(async (r) => ({
        redemptionId: r.id,
        pointsRedeemed: r.pointsRedeemed,
        redeemedAt: r.redeemedAt.toISOString(),
        notes: r.notes,
        bookingServices: r.bookingId
          ? await this.bookingCatalog.findBookingServices(dto.tenantId, r.bookingId)
          : [],
      })),
    );

    return { redemptions, pagination: { page: dto.page, limit: dto.limit, total } };
  }
}
