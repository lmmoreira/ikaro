import { Controller, Get, Query } from '@nestjs/common';
import { NoFeatureGate, SuspensionAccess } from '@ikaro/nestjs-http';
import {
  CheckSlugAvailabilityUseCase,
  CheckSlugAvailabilityUseCaseResult,
} from '../../application/use-cases/check-slug-availability.use-case';
import { mapPlatformError } from '../http/platform-error.mapper';

// Deliberately not under `internal/tenants/…`, where the `:tenantId` route would shadow it. The
// signup page is tenant-less, so the route carries the same tenant-less access declarations as
// every internal controller; the guard is the global `InternalApiGuard` (X-Internal-Key).
@NoFeatureGate()
@SuspensionAccess('ANY_AUTHENTICATED')
@Controller('internal/signup')
export class InternalSlugController {
  constructor(private readonly checkSlugAvailability: CheckSlugAvailabilityUseCase) {}

  @Get('slug-availability')
  getSlugAvailability(
    @Query('slug') slug: string | undefined,
  ): Promise<CheckSlugAvailabilityUseCaseResult> {
    return this.checkSlugAvailability.execute({ slug: slug ?? '' }).catch(mapPlatformError);
  }
}
