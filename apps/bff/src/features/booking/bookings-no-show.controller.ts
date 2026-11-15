import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CanonicalParseUUIDPipe, ZodValidationPipe } from '@ikaro/nestjs-http';
import { Roles } from '../../shared/decorators/roles.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import {
  CorrectNoShowBody,
  CorrectNoShowBodySchema,
  MarkNoShowBody,
  MarkNoShowBodySchema,
} from './bookings.schemas';
import { CorrectNoShowResponse, MarkNoShowResponse } from './bookings.types';

// M23-S09 (UC-074) — split from bookings.controller.ts (same 'bookings' base path, no URL change)
// to keep that file under the file-length cap, like bookings-attachments/bookings-guest.
@Controller('bookings')
export class BookingsNoShowController {
  constructor(private readonly backendHttp: BackendHttpService) {}

  // STAFF and MANAGER may record that the customer did not attend.
  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER', 'STAFF')
  markNoShow(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(MarkNoShowBodySchema)) body: MarkNoShowBody,
  ): Promise<MarkNoShowResponse> {
    return this.backendHttp.post<MarkNoShowResponse>(`/bookings/${id}/no-show`, body);
  }

  // Only a MANAGER may correct a mistaken no-show (to COMPLETED, awarding the loyalty points).
  @Post(':id/no-show/correct')
  @HttpCode(HttpStatus.OK)
  @Roles('MANAGER')
  correctNoShow(
    @Param('id', CanonicalParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CorrectNoShowBodySchema)) body: CorrectNoShowBody,
  ): Promise<CorrectNoShowResponse> {
    return this.backendHttp.post<CorrectNoShowResponse>(`/bookings/${id}/no-show/correct`, body);
  }
}
