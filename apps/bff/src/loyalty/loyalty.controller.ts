import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CustomerLoyaltyBalanceResponse } from '@ikaro/types';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { Roles } from '../shared/decorators/roles.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';
import {
  LoyaltyBalanceResponse,
  LoyaltyEntriesResponse,
  LoyaltyRedemptionsResponse,
  RedeemPointsResponse,
} from './loyalty.types';

// points_per_currency_unit — see M13-S12/M13-S11; not landed yet, hardcode disabled.
const REDEMPTION_CONVERSION_RATE = 0;

const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type PaginationQuery = z.infer<typeof PaginationSchema>;

const RedeemPointsSchema = z.object({
  customerId: z.uuid(),
  pointsToRedeem: z.number().int().min(1),
  notes: z.string().optional().nullable(),
  bookingId: z.uuid().optional().nullable(),
});

type RedeemPointsBody = z.infer<typeof RedeemPointsSchema>;

@Controller()
export class LoyaltyController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  // ── Customer routes ────────────────────────────────────────────────────────

  @Get('loyalty/balance')
  @Roles('CUSTOMER')
  async getBalance(): Promise<CustomerLoyaltyBalanceResponse> {
    const balance = await this.backendHttp.get<LoyaltyBalanceResponse>('/loyalty/balance');
    return {
      currentPoints: balance.currentPoints,
      nextExpiryDate: balance.nextExpiryDate,
      nextExpiryPoints: balance.nextExpiryPoints,
      conversionRate: REDEMPTION_CONVERSION_RATE,
    };
  }

  @Get('loyalty/entries')
  @Roles('CUSTOMER')
  getEntries(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationQuery,
  ): Promise<LoyaltyEntriesResponse> {
    return this.backendHttp.get<LoyaltyEntriesResponse>('/loyalty/entries', query);
  }

  @Get('loyalty/redemptions')
  @Roles('CUSTOMER')
  getRedemptions(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationQuery,
  ): Promise<LoyaltyRedemptionsResponse> {
    return this.backendHttp.get<LoyaltyRedemptionsResponse>('/loyalty/redemptions', query);
  }

  // ── Admin routes ──────────────────────────────────────────────────────────

  @Post('loyalty/redeem')
  @HttpCode(HttpStatus.CREATED)
  @Roles('MANAGER', 'STAFF')
  redeemPoints(
    @Body(new ZodValidationPipe(RedeemPointsSchema)) body: RedeemPointsBody,
  ): Promise<RedeemPointsResponse> {
    return this.backendHttp.post<RedeemPointsResponse>('/loyalty/redeem', body);
  }

  @Get('customers/:customerId/loyalty/balance')
  @Roles('MANAGER', 'STAFF')
  getBalanceAdmin(
    @Param('customerId', ParseUUIDPipe) customerId: string,
  ): Promise<LoyaltyBalanceResponse> {
    return this.backendHttp.get<LoyaltyBalanceResponse>(`/customers/${customerId}/loyalty/balance`);
  }

  @Get('customers/:customerId/loyalty/entries')
  @Roles('MANAGER', 'STAFF')
  getEntriesAdmin(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationQuery,
  ): Promise<LoyaltyEntriesResponse> {
    return this.backendHttp.get<LoyaltyEntriesResponse>(
      `/customers/${customerId}/loyalty/entries`,
      query,
    );
  }

  @Get('customers/:customerId/loyalty/redemptions')
  @Roles('MANAGER', 'STAFF')
  getRedemptionsAdmin(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationQuery,
  ): Promise<LoyaltyRedemptionsResponse> {
    return this.backendHttp.get<LoyaltyRedemptionsResponse>(
      `/customers/${customerId}/loyalty/redemptions`,
      query,
    );
  }
}
