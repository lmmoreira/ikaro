import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingStatusTransitionRepository } from '../../../../test/repositories/booking/in-memory-booking-status-transition.repository';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import {
  RecurringBookingScheduleForbiddenError,
  RecurringBookingScheduleNotFoundError,
} from '../../domain/errors/recurring-booking-schedule.error';
import { ResourceType } from '../../domain/resource.types';
import { BookingStatus } from '../../domain/booking.aggregate';
import { futureDate } from '../../../../test/utils/date-helpers';
import { EndRecurringBookingScheduleUseCase } from './end-recurring-booking-schedule.use-case';

const TENANT = '10000000-0000-4000-8000-000000000302';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000398';
const CORRELATION_ID = 'corr-end-test';

function activeSchedule(tenantId = TENANT): RecurringBookingSchedule {
  const schedule = RecurringBookingSchedule.request({
    tenantId,
    customerId: 'customer-1',
    serviceId: 'service-1',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 60,
    },
    startsOn: '2026-09-01',
    endsOn: '2026-11-24',
    maxTermDays: 90,
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    resourceAssignments: [
      {
        resourceId: 'res-1',
        resourceType: ResourceType.ROOM,
        requirementId: null,
        requiredQuantityPosition: null,
      },
    ],
    status: 'ACTIVE',
    approvalHoldExpiresAt: null,
    createdByStaffId: null,
    correlationId: CORRELATION_ID,
  });
  schedule.clearDomainEvents();
  return schedule;
}

describe('EndRecurringBookingScheduleUseCase', () => {
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let bookingRepo: InMemoryBookingRepository;
  let transitionRepo: InMemoryBookingStatusTransitionRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let eventBus: InMemoryEventBus;
  let useCase: EndRecurringBookingScheduleUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository(eventBus);
    transitionRepo = new InMemoryBookingStatusTransitionRepository();
    bookingRepo = new InMemoryBookingRepository(eventBus, transitionRepo);
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    useCase = new EndRecurringBookingScheduleUseCase(
      scheduleRepo,
      bookingRepo,
      occupancyRepo,
      new InMemoryTransactionManager(),
    );
  });

  it('ends an ACTIVE schedule with no materialized occurrences yet', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);

    const result = await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      actorId: 'customer-1',
      actorRole: 'CUSTOMER',
    });

    expect(result.status).toBe('CANCELLED');
    expect(result.cancelledBookingIds).toEqual([]);
    const saved = await scheduleRepo.findById(schedule.id, TENANT);
    expect(saved?.status).toBe('CANCELLED');
    expect(saved?.cancellationReason).toBe('CUSTOMER_CANCELLED');
  });

  it('cancels every future active Booking already materialized by this schedule', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);
    const booking = new BookingBuilder()
      .withTenantId(TENANT)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(new Date(`${futureDate(7)}T13:00:00.000Z`))
      .withRecurringScheduleId(schedule.id)
      .build();
    await bookingRepo.save(booking);

    const result = await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      actorId: 'customer-1',
      actorRole: 'CUSTOMER',
    });

    expect(result.cancelledBookingIds).toEqual([booking.id]);
    const cancelled = await bookingRepo.findById(booking.id, TENANT);
    expect(cancelled?.status).toBe(BookingStatus.CANCELLED);
  });

  it('records each cancelled occurrence as one audit row for the ending actor', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);
    const booking = new BookingBuilder()
      .withTenantId(TENANT)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(new Date(`${futureDate(7)}T13:00:00.000Z`))
      .withRecurringScheduleId(schedule.id)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      actorId: 'customer-1',
      actorRole: 'CUSTOMER',
    });

    expect(transitionRepo.all()).toMatchObject([
      {
        bookingId: booking.id,
        fromStatus: 'APPROVED',
        toStatus: 'CANCELLED',
        actorId: 'customer-1',
      },
    ]);
  });

  it('cancels every occurrence with cancelledByScheduleEnd and reports who ended the schedule', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);
    const bookings = [7, 14, 21].map((days) =>
      new BookingBuilder()
        .withTenantId(TENANT)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(`${futureDate(days)}T13:00:00.000Z`))
        .withRecurringScheduleId(schedule.id)
        .build(),
    );
    for (const booking of bookings) await bookingRepo.save(booking);

    await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      actorId: 'manager-1',
      actorRole: 'MANAGER',
    });

    const cancelled = eventBus.published.filter((e) => e.eventName === 'BookingCancelled');
    expect(cancelled).toHaveLength(3);
    expect(
      cancelled.every(
        (e) => (e.data as { cancelledByScheduleEnd: boolean }).cancelledByScheduleEnd,
      ),
    ).toBe(true);
    const ended = eventBus.published.filter((e) => e.eventName === 'RecurringBookingScheduleEnded');
    expect(ended).toHaveLength(1);
    expect((ended[0].data as { endedBy: string }).endedBy).toBe('STAFF');
    const saved = await scheduleRepo.findById(schedule.id, TENANT);
    expect(saved?.cancellationReason).toBe('STAFF_CANCELLED');
  });

  it('throws when the schedule does not exist', async () => {
    await expect(
      useCase.execute({
        scheduleId: 'missing',
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        actorId: 'customer-1',
        actorRole: 'CUSTOMER',
      }),
    ).rejects.toThrow(RecurringBookingScheduleNotFoundError);
  });

  it('throws NotFound for a schedule that belongs to a different tenant', async () => {
    const schedule = activeSchedule(OTHER_TENANT);
    scheduleRepo.seed(schedule);

    await expect(
      useCase.execute({
        scheduleId: schedule.id,
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        actorId: 'customer-1',
        actorRole: 'CUSTOMER',
      }),
    ).rejects.toThrow(RecurringBookingScheduleNotFoundError);
  });

  it('lets a MANAGER end any customer schedule, recording the manager as the audit actor', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);
    const booking = new BookingBuilder()
      .withTenantId(TENANT)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(new Date(`${futureDate(7)}T13:00:00.000Z`))
      .withRecurringScheduleId(schedule.id)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      actorId: 'manager-1',
      actorRole: 'MANAGER',
    });

    expect(transitionRepo.all()).toMatchObject([
      {
        bookingId: booking.id,
        toStatus: 'CANCELLED',
        actorType: 'MANAGER',
        actorId: 'manager-1',
      },
    ]);
  });

  it('rejects a CUSTOMER actor ending a schedule that belongs to another customer', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);

    await expect(
      useCase.execute({
        scheduleId: schedule.id,
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        actorId: 'someone-else',
        actorRole: 'CUSTOMER',
      }),
    ).rejects.toThrow(RecurringBookingScheduleForbiddenError);
  });
});
