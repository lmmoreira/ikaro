import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IBookingQuoteRevisionRepository } from '../../application/ports/booking-quote-revision-repository.port';
import { BookingQuoteRevision } from '../../domain/booking-quote-revision';
import { BookingQuoteRevisionEntity } from '../entities/booking-quote-revision.entity';

@Injectable()
export class TypeOrmBookingQuoteRevisionRepository implements IBookingQuoteRevisionRepository {
  constructor(
    @InjectRepository(BookingQuoteRevisionEntity)
    private readonly repo: Repository<BookingQuoteRevisionEntity>,
  ) {}

  // Naturally race-free: the caller (RescheduleBookingUseCase/RescheduleBookingAsCustomerUseCase)
  // only reaches this after Booking.save()'s own optimistic-lock UPDATE already serialized
  // concurrent reschedules of the same booking — a losing concurrent writer never gets here.
  async findLatestRevisionNo(tenantId: string, bookingId: string): Promise<number> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    const latest = await manager.findOne(BookingQuoteRevisionEntity, {
      where: { tenantId, bookingId },
      order: { revisionNo: 'DESC' },
      select: { revisionNo: true },
    });
    return latest?.revisionNo ?? 0;
  }

  // Always called inside the caller's own txManager.run() — architecture-check's
  // transactional-save detector enforces this stays textually true.
  async save(revision: BookingQuoteRevision): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    await manager.insert(BookingQuoteRevisionEntity, this.toEntity(revision));
  }

  private toEntity(revision: BookingQuoteRevision): BookingQuoteRevisionEntity {
    const entity = new BookingQuoteRevisionEntity();
    entity.id = revision.id;
    entity.tenantId = revision.tenantId;
    entity.bookingId = revision.bookingId;
    entity.classSessionBookingId = null;
    entity.revisionNo = revision.revisionNo;
    entity.amount = revision.amount.amount.toFixed(2);
    entity.currency = revision.amount.currency;
    entity.reason = revision.reason;
    entity.actorType = revision.actorType;
    entity.actorId = revision.actorId;
    entity.occurredAt = revision.occurredAt;
    return entity;
  }
}
