import { Controller, Get, Param, Query } from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  QuoteServiceDurationDto,
  QuoteServiceDurationSchema,
} from '../../application/dtos/quote-service-duration.dto';
import {
  ListServiceResourceOptionsUseCase,
  ListServiceResourceOptionsUseCaseResult,
} from '../../application/use-cases/list-service-resource-options.use-case';
import {
  QuoteServiceDurationUseCase,
  QuoteServiceDurationUseCaseResult,
} from '../../application/use-cases/quote-service-duration.use-case';
import { mapBookingError } from '../http/booking-error.mapper';

// Guest/customer booking-flow reads — deliberately no role guard (tenant comes from X-Tenant-ID,
// set by the BFF's public tenant resolution; the global InternalApiGuard still applies). Kept apart
// from ServiceController, whose routes are the staff/manager configuration surface.
@Controller('services')
export class ServicePublicController {
  constructor(
    private readonly tenantContext: RequestContext,
    private readonly listServiceResourceOptions: ListServiceResourceOptionsUseCase,
    private readonly quoteServiceDuration: QuoteServiceDurationUseCase,
  ) {}

  // The active resources a customer may pick per CUSTOMER_CHOICE requirement — { resourceId, name }
  // only, never refId, hours or the linked staff record.
  @Get(':id/resource-options')
  listResourceOptions(
    @Param('id', CanonicalParseUUIDPipe) id: string,
  ): Promise<ListServiceResourceOptionsUseCaseResult> {
    return this.listServiceResourceOptions
      .execute({ id, tenantId: this.tenantContext.tenantId })
      .catch(mapBookingError);
  }

  @Get(':id/quote')
  quote(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(QuoteServiceDurationSchema)) query: QuoteServiceDurationDto,
  ): Promise<QuoteServiceDurationUseCaseResult> {
    return this.quoteServiceDuration
      .execute({
        id,
        tenantId: this.tenantContext.tenantId,
        durationMinutes: query.durationMinutes,
      })
      .catch(mapBookingError);
  }
}
