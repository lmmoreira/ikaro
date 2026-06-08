import { Inject, Injectable } from '@nestjs/common';
import { Booking } from '../../domain/booking.aggregate';
import { BOOKING_REPOSITORY, IBookingRepository } from '../ports/booking-repository.port';

@Injectable()
export class BookingQueryService {
  constructor(@Inject(BOOKING_REPOSITORY) private readonly repo: IBookingRepository) {}

  findById(id: string, tenantId: string): Promise<Booking | null> {
    return this.repo.findById(id, tenantId);
  }
}
