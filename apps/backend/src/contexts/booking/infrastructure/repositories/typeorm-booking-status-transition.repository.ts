import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { IBookingStatusTransitionRepository } from '../../application/ports/booking-status-transition-repository.port';
import { BookingStatusTransition } from '../../domain/booking-status-transition';
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
