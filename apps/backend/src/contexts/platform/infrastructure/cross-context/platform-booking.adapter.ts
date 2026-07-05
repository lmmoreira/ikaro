import { Injectable } from '@nestjs/common';
import { GetBookingByIdUseCase } from '../../../booking/application/use-cases/get-booking-by-id.use-case';
import {
  BookingLookupSummary,
  IPlatformBookingPort,
} from '../../application/ports/platform-booking.port';

@Injectable()
export class PlatformBookingAdapter implements IPlatformBookingPort {
  constructor(private readonly getBookingById: GetBookingByIdUseCase) {}

  async findById(bookingId: string, tenantId: string): Promise<BookingLookupSummary | null> {
    try {
      // cancellationWindowHours only affects the response's cancellableUntil field, which this
      // adapter never reads (it maps id/customerId/photo URLs only) — 0 is a safe unused placeholder.
      const booking = await this.getBookingById.execute({
        bookingId,
        tenantId,
        cancellationWindowHours: 0,
      });
      return {
        id: booking.id,
        customerId: booking.customerId,
        beforeServicePhotoUrls: booking.beforeServicePhotoUrls,
        afterServicePhotoUrls: booking.afterServicePhotoUrls,
      };
    } catch {
      return null;
    }
  }
}
