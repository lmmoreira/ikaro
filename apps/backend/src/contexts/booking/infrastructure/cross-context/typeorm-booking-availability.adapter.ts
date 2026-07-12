import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { endOfDayUTC, startOfDayUTC } from '../../../../shared/utils/calendar-date';
import { IBookingAvailabilityPort } from '../../application/ports/booking-availability.port';
import { BookedSlot } from '../../domain/booked-slot';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingEntity } from '../entities/booking.entity';

@Injectable()
export class TypeOrmBookingAvailabilityAdapter implements IBookingAvailabilityPort {
  constructor(
    @InjectRepository(BookingEntity)
    private readonly repo: Repository<BookingEntity>,
  ) {}

  async lockTenantDay(tenantId: string, date: string): Promise<void> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('Booking slot lock requires an active transaction');
    }

    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0), hashtextextended($2, 0))',
      [tenantId, date],
    );
  }

  async findApprovedByTenantAndDate(tenantId: string, date: string): Promise<BookedSlot[]> {
    return this.queryApproved(tenantId, startOfDayUTC(date), endOfDayUTC(date));
  }

  async findApprovedByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
  ): Promise<BookedSlot[]> {
    return this.queryApproved(tenantId, startOfDayUTC(from), endOfDayUTC(to));
  }

  private async queryApproved(
    tenantId: string,
    isoStart: string,
    isoEnd: string,
  ): Promise<BookedSlot[]> {
    const manager = getActiveEntityManager();
    const repository = manager ? manager.getRepository(BookingEntity) : this.repo;
    const entities = await repository.find({
      where: {
        tenantId,
        status: BookingStatus.APPROVED,
        scheduledAt: Between(new Date(isoStart), new Date(isoEnd)),
      },
      select: { id: true, scheduledAt: true, totalDurationMins: true },
    });
    return entities.map((e) => ({
      id: e.id,
      scheduledAt: e.scheduledAt,
      totalDurationMins: e.totalDurationMins,
    }));
  }
}
