import { Injectable } from '@nestjs/common';
import { BookingQueryService } from '../../../booking/application/services/booking-query.service';
import {
  BookingLookupSummary,
  IBookingLookupPort,
} from '../../application/ports/booking-lookup.port';

@Injectable()
export class BookingLookupAdapter implements IBookingLookupPort {
  constructor(private readonly bookingQueryService: BookingQueryService) {}

  async findById(bookingId: string, tenantId: string): Promise<BookingLookupSummary | null> {
    try {
      const booking = await this.bookingQueryService.findById(bookingId, tenantId);
      if (!booking) return null;
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
