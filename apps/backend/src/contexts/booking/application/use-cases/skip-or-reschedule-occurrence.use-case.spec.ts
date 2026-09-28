import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import {
  RecurringBookingScheduleExceptionAlreadyExistsError,
  RecurringBookingScheduleForbiddenError,
  RecurringBookingScheduleNotFoundError,
} from '../../domain/errors/recurring-booking-schedule.error';
import {
  BookingForbiddenError,
  BookingNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { ResourceType } from '../../domain/resource.types';
import { BookingStatus } from '../../domain/booking.aggregate';
import { futureDate } from '../../../../test/utils/date-helpers';
import { SkipOrRescheduleOccurrenceUseCase } from './skip-or-reschedule-occurrence.use-case';

const TENANT = '10000000-0000-4000-8000-000000000303';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000397';
const CORRELATION_ID = 'corr-skip-test';
const OCCURRENCE_START = new Date(`${futureDate(7)}T13:00:00.000Z`);

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
    endsOn: null,
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

describe('SkipOrRescheduleOccurrenceUseCase', () => {
  let scheduleRepo: InMemoryRecurringBookingScheduleRepository;
  let bookingRepo: InMemoryBookingRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let useCase: SkipOrRescheduleOccurrenceUseCase;

  beforeEach(() => {
    const eventBus = new InMemoryEventBus();
    scheduleRepo = new InMemoryRecurringBookingScheduleRepository(eventBus);
    bookingRepo = new InMemoryBookingRepository(eventBus);
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    useCase = new SkipOrRescheduleOccurrenceUseCase(
      scheduleRepo,
      bookingRepo,
      occupancyRepo,
      new InMemoryTransactionManager(),
    );
  });

  it('records a SKIPPED exception when no occurrence has been materialized yet', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);

    const result = await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      occurrenceStart: OCCURRENCE_START,
      action: 'SKIP',
      reason: 'travelling',
      actorType: 'CUSTOMER',
      actorId: 'customer-1',
    });

    expect(result.kind).toBe('SKIPPED');
    const saved = await scheduleRepo.findById(schedule.id, TENANT);
    expect(saved?.exceptions).toHaveLength(1);
  });

  it('cancels the linked Booking when SKIP targets an already-materialized occurrence', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);
    const booking = new BookingBuilder()
      .withTenantId(TENANT)
      .withStatus(BookingStatus.APPROVED)
      .withScheduledAt(OCCURRENCE_START)
      .withRecurringScheduleId(schedule.id)
      .build();
    await bookingRepo.save(booking);

    await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      occurrenceStart: OCCURRENCE_START,
      action: 'SKIP',
      actorType: 'CUSTOMER',
      actorId: 'customer-1',
    });

    const cancelled = await bookingRepo.findById(booking.id, TENANT);
    expect(cancelled?.status).toBe(BookingStatus.CANCELLED);
  });

  it('records a RESCHEDULED exception with a valid replacementBookingId', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);
    const replacement = new BookingBuilder()
      .withTenantId(TENANT)
      .withCustomerId('customer-1')
      .build();
    await bookingRepo.save(replacement);

    const result = await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      occurrenceStart: OCCURRENCE_START,
      action: 'RESCHEDULE',
      replacementBookingId: replacement.id,
      actorType: 'CUSTOMER',
      actorId: 'customer-1',
    });

    expect(result.kind).toBe('RESCHEDULED');
    const saved = await scheduleRepo.findById(schedule.id, TENANT);
    expect(saved?.exceptions[0].replacementBookingId).toBe(replacement.id);
  });

  it('throws when the replacementBookingId does not exist', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);

    await expect(
      useCase.execute({
        scheduleId: schedule.id,
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        occurrenceStart: OCCURRENCE_START,
        action: 'RESCHEDULE',
        replacementBookingId: 'missing',
        actorType: 'CUSTOMER',
        actorId: 'customer-1',
      }),
    ).rejects.toThrow(BookingNotFoundError);
  });

  it('rejects a duplicate exception for the same occurrenceStart', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);
    await useCase.execute({
      scheduleId: schedule.id,
      tenantId: TENANT,
      correlationId: CORRELATION_ID,
      occurrenceStart: OCCURRENCE_START,
      action: 'SKIP',
      actorType: 'CUSTOMER',
      actorId: 'customer-1',
    });

    await expect(
      useCase.execute({
        scheduleId: schedule.id,
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        occurrenceStart: OCCURRENCE_START,
        action: 'SKIP',
        actorType: 'CUSTOMER',
        actorId: 'customer-1',
      }),
    ).rejects.toThrow(RecurringBookingScheduleExceptionAlreadyExistsError);
  });

  it('throws NotFound for a schedule that belongs to a different tenant', async () => {
    const schedule = activeSchedule(OTHER_TENANT);
    scheduleRepo.seed(schedule);

    await expect(
      useCase.execute({
        scheduleId: schedule.id,
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        occurrenceStart: OCCURRENCE_START,
        action: 'SKIP',
        actorType: 'CUSTOMER',
        actorId: 'customer-1',
      }),
    ).rejects.toThrow(RecurringBookingScheduleNotFoundError);
  });

  it("rejects a CUSTOMER actor skipping an occurrence on another customer's schedule", async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);

    await expect(
      useCase.execute({
        scheduleId: schedule.id,
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        occurrenceStart: OCCURRENCE_START,
        action: 'SKIP',
        actorType: 'CUSTOMER',
        actorId: 'someone-else',
      }),
    ).rejects.toThrow(RecurringBookingScheduleForbiddenError);
  });

  it('rejects a replacementBookingId that belongs to a different customer', async () => {
    const schedule = activeSchedule();
    scheduleRepo.seed(schedule);
    const replacement = new BookingBuilder()
      .withTenantId(TENANT)
      .withCustomerId('someone-else')
      .build();
    await bookingRepo.save(replacement);

    await expect(
      useCase.execute({
        scheduleId: schedule.id,
        tenantId: TENANT,
        correlationId: CORRELATION_ID,
        occurrenceStart: OCCURRENCE_START,
        action: 'RESCHEDULE',
        replacementBookingId: replacement.id,
        actorType: 'CUSTOMER',
        actorId: 'customer-1',
      }),
    ).rejects.toThrow(BookingForbiddenError);
  });
});
