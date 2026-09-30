import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingStatusTransition } from '../../domain/booking-status-transition';
import { BookingStatusTransitionEntity } from '../entities/booking-status-transition.entity';
import { TypeOrmBookingStatusTransitionRepository } from './typeorm-booking-status-transition.repository';

const TENANT = '00000000-0000-7000-8000-0000000000b1';
const BOOKING_ID = '00000000-0000-7000-8000-0000000000b2';
const ACTOR_ID = '00000000-0000-7000-8000-0000000000b3';
const CORRELATION_ID = '00000000-0000-7000-8000-0000000000b4';

describe('TypeOrmBookingStatusTransitionRepository', () => {
  let repo: TypeOrmBookingStatusTransitionRepository;
  let ormRepo: jest.Mocked<Repository<BookingStatusTransitionEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmBookingStatusTransitionRepository,
        {
          provide: getRepositoryToken(BookingStatusTransitionEntity),
          useValue: { manager: { insert: jest.fn() } },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmBookingStatusTransitionRepository);
    ormRepo = moduleRef.get(getRepositoryToken(BookingStatusTransitionEntity));
  });

  it('inserts one row mapped from the transition', async () => {
    const transition = BookingStatusTransition.record({
      tenantId: TENANT,
      bookingId: BOOKING_ID,
      fromStatus: 'APPROVED',
      toStatus: 'NO_SHOW',
      reason: 'Cliente não atendeu o telefone.',
      actorType: 'STAFF',
      actorId: ACTOR_ID,
      correlationId: CORRELATION_ID,
    });

    await repo.save(transition);

    expect(ormRepo.manager.insert).toHaveBeenCalledTimes(1);
    expect(ormRepo.manager.insert).toHaveBeenCalledWith(
      BookingStatusTransitionEntity,
      expect.objectContaining({
        tenantId: TENANT,
        id: transition.id,
        bookingId: BOOKING_ID,
        fromStatus: 'APPROVED',
        toStatus: 'NO_SHOW',
        reason: 'Cliente não atendeu o telefone.',
        actorType: 'STAFF',
        actorId: ACTOR_ID,
        occurredAt: transition.occurredAt,
        correlationId: CORRELATION_ID,
      }),
    );
  });

  it('stores a null reason when none was given', async () => {
    const transition = BookingStatusTransition.record({
      tenantId: TENANT,
      bookingId: BOOKING_ID,
      fromStatus: 'APPROVED',
      toStatus: 'NO_SHOW',
      actorType: 'MANAGER',
      actorId: ACTOR_ID,
      correlationId: CORRELATION_ID,
    });

    await repo.save(transition);

    expect(ormRepo.manager.insert).toHaveBeenCalledWith(
      BookingStatusTransitionEntity,
      expect.objectContaining({ reason: null }),
    );
  });
});
