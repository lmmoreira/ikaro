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
import {
  CustomerLoyaltyBalanceResponse,
  CustomerLoyaltyEntriesResponse,
  CustomerLoyaltyRedemptionsResponse,
} from '@ikaro/types';
import { ZodValidationPipe } from '../shared/http/zod-validation.pipe';
import { Roles } from '../shared/decorators/roles.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';
import {
  LoyaltyBalanceResponse,
  LoyaltyEntriesResponse,
  LoyaltyRedemptionsResponse,
  RedeemPointsResponse,
} from './loyalty.types';
import { toCustomerLoyaltyEntry, toCustomerLoyaltyRedemption } from './loyalty.mapper';

// Forward-looking rate shown on the balance card (e.g. "10 pts = R$ 1,00"), decoupled from any
// past redemption — those store their own pointsPerCurrencyUnit at the time they happened.
// Reading the real tenants.settings.loyalty.points_per_currency_unit here is M13-S12's scope.
const BALANCE_DISPLAY_CONVERSION_RATE = 0;

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
      conversionRate: BALANCE_DISPLAY_CONVERSION_RATE,
    };
  }

  @Get('loyalty/entries')
  @Roles('CUSTOMER')
  async getEntries(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationQuery,
  ): Promise<CustomerLoyaltyEntriesResponse> {
    const backend = await this.backendHttp.get<LoyaltyEntriesResponse>('/loyalty/entries', query);
    return {
      items: backend.entries.map(toCustomerLoyaltyEntry),
      total: backend.pagination.total,
      page: backend.pagination.page,
      limit: backend.pagination.limit,
    };
  }

  @Get('loyalty/redemptions')
  @Roles('CUSTOMER')
  async getRedemptions(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationQuery,
  ): Promise<CustomerLoyaltyRedemptionsResponse> {
    const backend = await this.backendHttp.get<LoyaltyRedemptionsResponse>(
      '/loyalty/redemptions',
      query,
    );
    return {
      items: backend.redemptions.map(toCustomerLoyaltyRedemption),
      total: backend.pagination.total,
      page: backend.pagination.page,
      limit: backend.pagination.limit,
    };
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
