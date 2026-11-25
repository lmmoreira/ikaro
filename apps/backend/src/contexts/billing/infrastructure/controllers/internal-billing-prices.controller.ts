import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { NoFeatureGate, SuspensionAccess } from '@ikaro/nestjs-http';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import {
  ListSelectablePricesUseCase,
  ListSelectablePricesUseCaseResult,
} from '../../application/use-cases/list-selectable-prices.use-case';
import { mapBillingError } from '../http/billing-error.mapper';

// The public price list (UC-128), called by the BFF's `GET /v1/public/billing/prices`. Tenant-less by
// design: the price list is platform-wide data with no tenant owner, and `/internal/*` skips the
// RequestInterceptor. A thin forwarder: the supported-country gate and the "today" date are the use
// case's, so this route never decides what a country may see.
@UseGuards(InternalApiGuard)
@NoFeatureGate()
@SuspensionAccess('ANY_AUTHENTICATED')
@Controller('internal/billing/public-prices')
export class InternalBillingPricesController {
  constructor(private readonly listSelectablePrices: ListSelectablePricesUseCase) {}

  @Get()
  list(@Query('country') country: string | undefined): Promise<ListSelectablePricesUseCaseResult> {
    // A missing value reaches the use case as an empty code, which `CountryCode` reports as `400`.
    return this.listSelectablePrices.execute({ countryCode: country ?? '' }).catch(mapBillingError);
  }
}
