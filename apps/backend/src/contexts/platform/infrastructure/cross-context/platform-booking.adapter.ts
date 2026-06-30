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
      const booking = await this.getBookingById.execute({ bookingId, tenantId, locale: 'pt-BR' });
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
