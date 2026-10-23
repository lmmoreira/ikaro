import { Body, Controller, HttpCode, HttpStatus, Param, Patch, UseGuards } from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { StaffOrManagerRoleGuard } from '../../../../shared/guards/staff-or-manager-role.guard';
import { RequestContext } from '../../../../shared/request/request-context';
import {
  UpdateServicePublicPageDto,
  UpdateServicePublicPageSchema,
} from '../../application/dtos/update-service-public-page.dto';
import {
  UpdateServicePublicPageUseCase,
  UpdateServicePublicPageUseCaseResult,
} from '../../application/use-cases/update-service-public-page.use-case';
import { mapBookingError } from '../http/booking-error.mapper';

// UC-013 A5 (TD56-S03) — the Página pública tab of the service editor: the publish switch and the
// page's profile. STAFF | MANAGER like every other service configuration write; uploading the
// images itself is MANAGER-only (the hotsite signed-url endpoint). Kept apart from ServiceController
// (file-length limit), under the same `services` prefix.
@Controller('services')
export class ServicePublicPageController {
  constructor(
    private readonly tenantContext: RequestContext,
    private readonly updateServicePublicPage: UpdateServicePublicPageUseCase,
  ) {}

  @Patch(':id/public-page')
  @HttpCode(HttpStatus.OK)
  @UseGuards(StaffOrManagerRoleGuard)
  update(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateServicePublicPageSchema)) body: UpdateServicePublicPageDto,
  ): Promise<UpdateServicePublicPageUseCaseResult> {
    return this.updateServicePublicPage
      .execute({ ...body, id, tenantId: this.tenantContext.tenantId })
      .catch(mapBookingError);
  }
}
