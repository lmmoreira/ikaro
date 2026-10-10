import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingStatusTransitionEntityBuilder } from '../../../../test/builders/booking/index';
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
          useValue: { manager: { insert: jest.fn() }, find: jest.fn() },
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

    await repo.saveAll([transition]);

    expect(ormRepo.manager.insert).toHaveBeenCalledTimes(1);
    expect(ormRepo.manager.insert).toHaveBeenCalledWith(BookingStatusTransitionEntity, [
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
    ]);
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

    await repo.saveAll([transition]);

    expect(ormRepo.manager.insert).toHaveBeenCalledWith(BookingStatusTransitionEntity, [
      expect.objectContaining({ reason: null }),
    ]);
  });

  it('inserts several transitions in one statement', async () => {
    const make = (toStatus: string) =>
      BookingStatusTransition.record({
        tenantId: TENANT,
        bookingId: BOOKING_ID,
        fromStatus: 'PENDING',
        toStatus,
        actorType: 'STAFF',
        actorId: ACTOR_ID,
        correlationId: CORRELATION_ID,
      });

    await repo.saveAll([make('INFO_REQUESTED'), make('APPROVED')]);

    expect(ormRepo.manager.insert).toHaveBeenCalledTimes(1);
    expect(ormRepo.manager.insert).toHaveBeenCalledWith(BookingStatusTransitionEntity, [
      expect.objectContaining({ toStatus: 'INFO_REQUESTED' }),
      expect.objectContaining({ toStatus: 'APPROVED' }),
    ]);
  });

  it('reads a booking history tenant-scoped, oldest first, and maps rows back to transitions', async () => {
    const occurredAt = new Date('2026-06-01T15:00:00.000Z');
    ormRepo.find.mockResolvedValue([
      new BookingStatusTransitionEntityBuilder()
        .withTenantId(TENANT)
        .withId('00000000-0000-7000-8000-0000000000c1')
        .withBookingId(BOOKING_ID)
        .withFromStatus('APPROVED')
        .withToStatus('NO_SHOW')
        .withReason('Cliente não atendeu o telefone.')
        .withActorType('MANAGER')
        .withActorId(ACTOR_ID)
        .withOccurredAt(occurredAt)
        .withCorrelationId(CORRELATION_ID)
        .build(),
    ]);

    const result = await repo.findByBooking(TENANT, BOOKING_ID);

    expect(ormRepo.find).toHaveBeenCalledWith({
      where: { tenantId: TENANT, bookingId: BOOKING_ID },
      order: { occurredAt: 'ASC', id: 'ASC' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      tenantId: TENANT,
      bookingId: BOOKING_ID,
      fromStatus: 'APPROVED',
      toStatus: 'NO_SHOW',
      reason: 'Cliente não atendeu o telefone.',
      actorType: 'MANAGER',
      actorId: ACTOR_ID,
      occurredAt,
    });
  });

  it('does nothing when there are no transitions', async () => {
    await repo.saveAll([]);

    expect(ormRepo.manager.insert).not.toHaveBeenCalled();
  });
});
