import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../../shared/http/zod-validation.pipe';
import { RequestContext } from '../../../../shared/request/request-context';
import { AnyAuthenticatedRoleGuard } from '../../../../shared/guards/any-authenticated-role.guard';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { PaginationDto, PaginationSchema } from '../../application/dtos/pagination.dto';
import { RedeemPointsDto, RedeemPointsSchema } from '../../application/dtos/redeem-points.dto';
import {
  GetLoyaltyBalanceUseCase,
  GetLoyaltyBalanceResult,
} from '../../application/use-cases/get-loyalty-balance/get-loyalty-balance.use-case';
import {
  GetLoyaltyEntriesUseCase,
  GetLoyaltyEntriesResult,
} from '../../application/use-cases/get-loyalty-entries/get-loyalty-entries.use-case';
import {
  GetLoyaltyRedemptionsUseCase,
  GetLoyaltyRedemptionsResult,
} from '../../application/use-cases/get-loyalty-redemptions/get-loyalty-redemptions.use-case';
import {
  RedeemPointsUseCase,
  RedeemPointsUseCaseResult,
} from '../../application/use-cases/redeem-points/redeem-points.use-case';
import { CustomerRoleGuard } from '../../../../shared/guards/customer-role.guard';
import { mapLoyaltyError } from '../http/loyalty-error.mapper';

@Controller()
export class LoyaltyController {
  constructor(
    private readonly getLoyaltyBalance: GetLoyaltyBalanceUseCase,
    private readonly getLoyaltyEntries: GetLoyaltyEntriesUseCase,
    private readonly getLoyaltyRedemptions: GetLoyaltyRedemptionsUseCase,
    private readonly redeemPointsUseCase: RedeemPointsUseCase,
    private readonly tenantContext: RequestContext,
  ) {}

  // ── Customer routes ────────────────────────────────────────────────────────

  @Get('loyalty/balance')
  @UseGuards(CustomerRoleGuard)
  getBalance(): Promise<GetLoyaltyBalanceResult> {
    const { tenantId, actorId } = this.tenantContext;
    return this.getLoyaltyBalance
      .execute({ tenantId, customerId: actorId! })
      .catch(mapLoyaltyError);
  }

  @Get('loyalty/entries')
  @UseGuards(CustomerRoleGuard)
  getEntries(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<GetLoyaltyEntriesResult> {
    const { tenantId, actorId } = this.tenantContext;
    return this.getLoyaltyEntries
      .execute({ tenantId, customerId: actorId!, ...query })
      .catch(mapLoyaltyError);
  }

  @Get('loyalty/redemptions')
  @UseGuards(CustomerRoleGuard)
  getRedemptions(
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<GetLoyaltyRedemptionsResult> {
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
  @UseGuards(AnyAuthenticatedRoleGuard)
  getBalanceAdmin(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query(new ZodValidationPipe(z.object({ tenantId: z.uuid().optional() })))
    { tenantId }: { tenantId?: string },
  ): Promise<GetLoyaltyBalanceResult> {
    const { actorRole, actorId, tenantId: contextTenantId } = this.tenantContext;
    const effectiveTenantId = tenantId ?? contextTenantId;
    // Cross-tenant calls (tenantId query param ≠ JWT tenant) come from the BFF's getTenants()
    // which already validated the tenant list via /customers/me/tenants. Within the actor's
    // home tenant, enforce that a CUSTOMER can only read their own balance.
    const isCrossTenantCall = effectiveTenantId !== contextTenantId;
    if (actorRole === 'CUSTOMER' && !isCrossTenantCall && actorId !== customerId) {
      throw new ForbiddenException();
    }
    return this.getLoyaltyBalance
      .execute({ tenantId: effectiveTenantId, customerId })
      .catch(mapLoyaltyError);
  }

  @Get('customers/:customerId/loyalty/entries')
  @UseGuards(StaffOrManagerRoleGuard)
  getEntriesAdmin(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<GetLoyaltyEntriesResult> {
    return this.getLoyaltyEntries
      .execute({ tenantId: this.tenantContext.tenantId, customerId, ...query })
      .catch(mapLoyaltyError);
  }

  @Get('customers/:customerId/loyalty/redemptions')
  @UseGuards(StaffOrManagerRoleGuard)
  getRedemptionsAdmin(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query(new ZodValidationPipe(PaginationSchema)) query: PaginationDto,
  ): Promise<GetLoyaltyRedemptionsResult> {
    return this.getLoyaltyRedemptions
      .execute({ tenantId: this.tenantContext.tenantId, customerId, ...query })
      .catch(mapLoyaltyError);
  }
}
