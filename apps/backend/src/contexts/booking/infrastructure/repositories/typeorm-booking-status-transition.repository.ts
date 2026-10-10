import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IBookingStatusTransitionRepository } from '../../application/ports/booking-status-transition-repository.port';
import {
  BookingStatusTransition,
  BookingStatusTransitionActorType,
} from '../../domain/booking-status-transition';
import { BookingStatusTransitionEntity } from '../entities/booking-status-transition.entity';

@Injectable()
export class TypeOrmBookingStatusTransitionRepository implements IBookingStatusTransitionRepository {
  constructor(
    @InjectRepository(BookingStatusTransitionEntity)
    private readonly repo: Repository<BookingStatusTransitionEntity>,
  ) {}

  // Called from TypeOrmBookingRepository.save() on the booking's own manager, after the booking row
  // is written — the composite FK to bookings needs it to exist.
  async saveAll(transitions: BookingStatusTransition[]): Promise<void> {
    if (!transitions.length) return;
    const manager = getActiveEntityManager() ?? this.repo.manager;
    await manager.insert(
      BookingStatusTransitionEntity,
      transitions.map((t) => this.toEntity(t)),
    );
  }

  async findByBooking(tenantId: string, bookingId: string): Promise<BookingStatusTransition[]> {
    const rows = await this.repo.find({
      where: { tenantId, bookingId },
      order: { occurredAt: 'ASC', id: 'ASC' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  private toDomain(row: BookingStatusTransitionEntity): BookingStatusTransition {
    return BookingStatusTransition.reconstitute({
      id: row.id,
      tenantId: row.tenantId,
      bookingId: row.bookingId,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      reason: row.reason,
      actorType: row.actorType as BookingStatusTransitionActorType,
      actorId: row.actorId,
      occurredAt: row.occurredAt,
      correlationId: row.correlationId,
    });
  }

  private toEntity(transition: BookingStatusTransition): BookingStatusTransitionEntity {
    const entity = new BookingStatusTransitionEntity();
    entity.tenantId = transition.tenantId;
    entity.id = transition.id;
    entity.bookingId = transition.bookingId;
    entity.fromStatus = transition.fromStatus;
    entity.toStatus = transition.toStatus;
    entity.reason = transition.reason;
    entity.actorType = transition.actorType;
    entity.actorId = transition.actorId;
    entity.occurredAt = transition.occurredAt;
    entity.correlationId = transition.correlationId;
    return entity;
  }
}
