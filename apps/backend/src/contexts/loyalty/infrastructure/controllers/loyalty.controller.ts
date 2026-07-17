import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import {
  CrossTenantQueryDto,
  CrossTenantQuerySchema,
} from '../../application/dtos/cross-tenant-query.dto';
import { PaginationDto, PaginationSchema } from '../../application/dtos/pagination.dto';
import { RedeemPointsDto, RedeemPointsSchema } from '../../application/dtos/redeem-points.dto';
import {
  LOYALTY_CUSTOMER_PORT,
  ILoyaltyCustomerPort,
} from '../../application/ports/loyalty-customer.port';
import {
  GetLoyaltyBalanceUseCase,
  GetLoyaltyBalanceUseCaseResult,
} from '../../application/use-cases/get-loyalty-balance/get-loyalty-balance.use-case';
import {
  GetLoyaltyEntriesUseCase,
  GetLoyaltyEntriesUseCaseResult,
} from '../../application/use-cases/get-loyalty-entries/get-loyalty-entries.use-case';
import {
  GetLoyaltyRedemptionsUseCase,
  GetLoyaltyRedemptionsUseCaseResult,
} from '../../application/use-cases/get-loyalty-redemptions/get-loyalty-redemptions.use-case';
import {
  RedeemPointsUseCase,
  RedeemPointsUseCaseResult,
} from '../../application/use-cases/redeem-points/redeem-points.use-case';
import { CustomerRoleGuard } from '../../../../shared/guards/customer-role.guard';
import { mapLoyaltyError } from '../http/loyalty-error.mapper';

// conversionRate is tenant config (settings.loyalty.pointsPerCurrencyUnit) attached at the
// composition layer; null when the balance was read cross-tenant, where the request context
// carries the actor's home-tenant settings, not the effective tenant's.
export type EnrichedLoyaltyBalanceResult = GetLoyaltyBalanceUseCaseResult & {
  readonly conversionRate: number | null;
};

@Controller()
export class LoyaltyController {
  constructor(
    private readonly getLoyaltyBalance: GetLoyaltyBalanceUseCase,
    private readonly getLoyaltyEntries: GetLoyaltyEntriesUseCase,
    private readonly getLoyaltyRedemptions: GetLoyaltyRedemptionsUseCase,
    private readonly redeemPointsUseCase: RedeemPointsUseCase,
    private readonly tenantContext: RequestContext,
    @Inject(LOYALTY_CUSTOMER_PORT) private readonly loyaltyCustomer: ILoyaltyCustomerPort,
  ) {}

  // ── Customer routes ────────────────────────────────────────────────────────

  @Get('loyalty/balance')
  @UseGuards(CustomerRoleGuard)
  async getBalance(
    @Query(new ZodValidationPipe(CrossTenantQuerySchema))
    { tenantId }: CrossTenantQueryDto,
  ): Promise<EnrichedLoyaltyBalanceResult> {
    const { tenantId: contextTenantId, actorId, settings } = this.tenantContext;
    const effectiveTenantId = tenantId ?? contextTenantId;
    const isCrossTenantCall = effectiveTenantId !== contextTenantId;

    const customerId = isCrossTenantCall
      ? await this.loyaltyCustomer
          .resolveCustomerIdByOAuthId(actorId!, contextTenantId, effectiveTenantId)
          .catch(mapLoyaltyError)
      : actorId!;

    const balance = await this.getLoyaltyBalance
      .execute({ tenantId: effectiveTenantId, customerId })
      .catch(mapLoyaltyError);
    return {
      ...balance,
      conversionRate: isCrossTenantCall ? null : settings.loyalty.pointsPerCurrencyUnit,
    };
  }

  @Get('loyalty/entries')
  @UseGuards(CustomerRoleGuard)
  getEntries(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<GetLoyaltyEntriesUseCaseResult> {
    const { tenantId, actorId } = this.tenantContext;
    return this.getLoyaltyEntries
      .execute({ tenantId, customerId: actorId!, ...query })
      .catch(mapLoyaltyError);
  }

  @Get('loyalty/redemptions')
  @UseGuards(CustomerRoleGuard)
  getRedemptions(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<GetLoyaltyRedemptionsUseCaseResult> {
    const { tenantId, actorId } = this.tenantContext;
    return this.getLoyaltyRedemptions
      .execute({ tenantId, customerId: actorId!, ...query })
      .catch(mapLoyaltyError);
  }

  // ── Admin routes ──────────────────────────────────────────────────────────

  @Post('loyalty/redeem')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(StaffOrManagerRoleGuard)
  recordRedemption(
    @Body(new ZodValidationPipe(RedeemPointsSchema)) body: RedeemPointsDto,
  ): Promise<RedeemPointsUseCaseResult> {
    const { tenantId, actorId, settings } = this.tenantContext;
    return this.redeemPointsUseCase
      .execute({
        tenantId,
        customerId: body.customerId,
        pointsToRedeem: body.pointsToRedeem,
        pointsPerCurrencyUnit: settings.loyalty.pointsPerCurrencyUnit,
        redeemedBy: actorId!,
        notes: body.notes,
        bookingId: body.bookingId,
      })
      .catch(mapLoyaltyError);
  }

  @Get('customers/:customerId/loyalty/balance')
  @UseGuards(StaffOrManagerRoleGuard)
  async getBalanceAdmin(
    @Param('customerId', CanonicalParseUUIDPipe) customerId: string,
  ): Promise<EnrichedLoyaltyBalanceResult> {
    const { tenantId, settings } = this.tenantContext;
    const balance = await this.getLoyaltyBalance
      .execute({ tenantId, customerId })
      .catch(mapLoyaltyError);
    return { ...balance, conversionRate: settings.loyalty.pointsPerCurrencyUnit };
  }

  @Get('customers/:customerId/loyalty/entries')
  @UseGuards(StaffOrManagerRoleGuard)
  getEntriesAdmin(
    @Param('customerId', CanonicalParseUUIDPipe) customerId: string,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<GetLoyaltyEntriesUseCaseResult> {
    return this.getLoyaltyEntries
      .execute({ tenantId: this.tenantContext.tenantId, customerId, ...query })
      .catch(mapLoyaltyError);
  }

  @Get('customers/:customerId/loyalty/redemptions')
  @UseGuards(StaffOrManagerRoleGuard)
  getRedemptionsAdmin(
    @Param('customerId', CanonicalParseUUIDPipe) customerId: string,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<GetLoyaltyRedemptionsUseCaseResult> {
    return this.getLoyaltyRedemptions
      .execute({ tenantId: this.tenantContext.tenantId, customerId, ...query })
      .catch(mapLoyaltyError);
  }
}
