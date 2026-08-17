import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BffErrorCode, GuestBookingReadResponse } from '@ikaro/types';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { Public } from '../../shared/decorators/public.decorator';
import { BackendHttpService } from '../../shared/http/backend-http.service';
import { throwProblemDetail } from '../../shared/http/problem-detail';
import { toGuestBookingRead } from './bookings.mapper';
import { verifyGuestTokenOrThrow } from './guest-token.util';
import { BookingDetailResponse } from './bookings.types';
import { SubmitGuestBookingInfoBody, SubmitGuestBookingInfoBodySchema } from './bookings.schemas';

// Split out of bookings.controller.ts to keep it under the file-length cap — the two
// guest-token-gated (@Public()) endpoints under the same /bookings resource path. Same
// @Controller('bookings') base and routes as before the split, so no URL changes.
@Controller('bookings')
export class BookingsGuestController {
  private readonly jwtSecret: string;

  constructor(
    private readonly backendHttp: BackendHttpService,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
  }

  @Patch(':id/submit-info/guest')
  @HttpCode(HttpStatus.OK)
  @Public()
  async submitInfoGuest(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
    @Body(new ZodValidationPipe(SubmitGuestBookingInfoBodySchema)) body: SubmitGuestBookingInfoBody,
  ): Promise<{ bookingId: string; status: string; infoSubmittedAt: string }> {
    const payload = verifyGuestTokenOrThrow(id, token, this.jwtSecret);

    return this.backendHttp.patchForPublic(
      `/bookings/${id}/submit-info/guest`,
      { contactEmail: payload.contactEmail, ...body },
      payload.tenantId,
    );
  }

  @Get(':id/guest')
  @Public()
  async getOneGuest(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
  ): Promise<GuestBookingReadResponse> {
    const payload = verifyGuestTokenOrThrow(id, token, this.jwtSecret);

    const detail = await this.backendHttp.getForPublic<BookingDetailResponse>(
      `/bookings/${id}`,
      payload.tenantId,
    );

    if (detail.status !== 'INFO_REQUESTED') {
      throw throwProblemDetail(
        HttpStatus.CONFLICT,
        BffErrorCode.GUEST_BOOKING_NOT_AWAITING_INFO,
        'Booking is no longer awaiting additional information',
      );
    }

    return toGuestBookingRead(detail);
  }
}
