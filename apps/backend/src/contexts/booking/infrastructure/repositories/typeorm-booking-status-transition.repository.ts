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

  // Always called inside the caller's own txManager.run(), next to the booking's save() —
  // architecture-check's transactional-save detector enforces this stays textually true.
  async save(transition: BookingStatusTransition): Promise<void> {
    const manager = getActiveEntityManager() ?? this.repo.manager;
    await manager.insert(BookingStatusTransitionEntity, this.toEntity(transition));
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
