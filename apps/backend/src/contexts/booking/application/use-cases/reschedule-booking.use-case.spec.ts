import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { createAutoBookingResourceFixtures } from '../../../../test/repositories/booking/auto-degenerate-fixtures';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { futureDate, pastDate } from '../../../../test/utils/date-helpers';
import { BookingStatus } from '../../domain/booking.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  BookingNotFoundError,
  BookingScheduledInPastError,
  BookingSlotUnavailableError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { RescheduleBookingUseCase } from './reschedule-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000501';
const TENANT_B = '10000000-0000-4000-8000-000000000502';
const STAFF_ID = '20000000-0000-4000-8000-000000000501';
const CORRELATION_ID = 'corr-reschedule-test';

const futureSlot = `${futureDate(5)}T10:00:00.000Z`;
const newFutureSlot = `${futureDate(6)}T14:00:00.000Z`;

describe('RescheduleBookingUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let fixtures: ReturnType<typeof createAutoBookingResourceFixtures>;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let eventBus: InMemoryEventBus;
  let useCase: RescheduleBookingUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    fixtures = createAutoBookingResourceFixtures();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    useCase = new RescheduleBookingUseCase(
      bookingRepo,
      fixtures.serviceRepo,
      fixtures.resourceRepo,
      occupancyRepo,
      new AvailabilityService(),
      new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
      new InMemoryTransactionManager(),
    );
  });

  describe('happy path', () => {
    it('reschedules an APPROVED booking to a free slot and returns updated scheduledAt', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
      });

      expect(result.bookingId).toBe(booking.id);
      expect(result.status).toBe(BookingStatus.APPROVED);
      expect(result.scheduledAt).toBe(new Date(newFutureSlot).toISOString());
    });

    it('persists the new scheduledAt in the repository', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
      });

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.scheduledAt.toISOString()).toBe(new Date(newFutureSlot).toISOString());
    });

    it('persists optional adminNotes when provided', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        adminNotes: 'Customer requested earlier slot',
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
      });

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.adminNotes).toBe('Customer requested earlier slot');
    });

    it('moves the occupancy row(s) to the new window (M22-S03)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withTotalDurationMins(30)
        .build();
      await bookingRepo.save(booking);
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      await occupancyRepo.assign(
        TENANT_A,
        booking.lines[0].lineId,
        [
          {
            resourceId: resource.id,
            resourceType: ResourceType.LOCATION,
            resourceName: resource.name,
            legIndex: null,
            quantityPosition: null,
            selectionMode: 'NONE' as const,
            isBundleMember: false,
            startsAt: new Date(futureSlot),
            endsAt: new Date(new Date(futureSlot).getTime() + 30 * 60_000),
          },
        ],
        'COMMITTED',
        null,
      );

      await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
      });

      // Old window is free again.
      const oldWindowConflicts = await occupancyRepo.findConflictingResourceIds(TENANT_A, [
        {
          resourceId: resource.id,
          startsAt: new Date(futureSlot),
          endsAt: new Date(new Date(futureSlot).getTime() + 30 * 60_000),
        },
      ]);
      expect(oldWindowConflicts).toEqual([]);
      // New window is occupied.
      const newWindowConflicts = await occupancyRepo.findConflictingResourceIds(TENANT_A, [
        {
          resourceId: resource.id,
          startsAt: new Date(newFutureSlot),
          endsAt: new Date(new Date(newFutureSlot).getTime() + 30 * 60_000),
        },
      ]);
      expect(newWindowConflicts).toEqual([resource.id]);
    });
  });

  describe('BookingRescheduled event', () => {
    it('publishes BookingRescheduled with previousSlot, newSlot and rescheduledBy', async () => {
      const original = new Date(futureSlot);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(original)
        .withTotalDurationMins(30)
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({
        bookingId: booking.id,
        scheduledAt: newFutureSlot,
        tenantId: TENANT_A,
        staffId: STAFF_ID,
        correlationId: CORRELATION_ID,
        timezone: 'America/Sao_Paulo',
      });

      expect(eventBus.published).toHaveLength(1);
      expect(eventBus.published[0].eventName).toBe('BookingRescheduled');
      const data = eventBus.published[0].data as {
        previousSlot: { startTime: string; endTime: string };
        newSlot: { startTime: string; endTime: string };
        rescheduledBy: string;
      };
      expect(data.previousSlot.startTime).toBe(original.toISOString());
      expect(data.newSlot.startTime).toBe(new Date(newFutureSlot).toISOString());
      expect(data.rescheduledBy).toBe(STAFF_ID);
    });
  });

  describe('slot conflict', () => {
    it('throws BookingSlotUnavailableError when new slot conflicts with another booking', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .withTotalDurationMins(30)
        .build();
      await bookingRepo.save(booking);

      // another booking occupies the new slot
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      const conflictAt = new Date(newFutureSlot);
      occupancyRepo.seed(TENANT_A, 'other-line-id', {
        resourceId: resource.id,
        resourceType: ResourceType.LOCATION,
        resourceName: resource.name,
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'NONE' as const,
        isBundleMember: false,
        startsAt: conflictAt,
        endsAt: new Date(conflictAt.getTime() + 60 * 60_000),
      });

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
        }),
      ).rejects.toThrow(BookingSlotUnavailableError);
    });

    it('does not self-conflict when new slot overlaps the original slot on the same day (UC-060 A2)', async () => {
      const original = new Date(`${futureDate(5)}T10:00:00.000Z`);
      const overlapping = `${futureDate(5)}T10:15:00.000Z`;
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(original)
        .withTotalDurationMins(60)
        .build();
      await bookingRepo.save(booking);
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      // the booking's own existing occupancy row, at its original window
      await occupancyRepo.assign(
        TENANT_A,
        booking.lines[0].lineId,
        [
          {
            resourceId: resource.id,
            resourceType: ResourceType.LOCATION,
            resourceName: resource.name,
            legIndex: null,
            quantityPosition: null,
            selectionMode: 'NONE' as const,
            isBundleMember: false,
            startsAt: original,
            endsAt: new Date(original.getTime() + 60 * 60_000),
          },
        ],
        'COMMITTED',
        null,
      );

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: overlapping,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('error cases', () => {
    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({
          bookingId: '00000000-0000-4000-8000-000000000000',
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
        }),
      ).rejects.toThrow(BookingNotFoundError);
    });

    it('throws BookingScheduledInPastError when scheduledAt is in the past', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: `${pastDate(1)}T10:00:00.000Z`,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
        }),
      ).rejects.toThrow(BookingScheduledInPastError);
    });

    it('throws InvalidBookingTransitionError when booking is PENDING (only APPROVED can be rescheduled)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.PENDING)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
        }),
      ).rejects.toThrow(InvalidBookingTransitionError);
    });

    it('throws InvalidBookingTransitionError when booking is CANCELLED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.CANCELLED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
        }),
      ).rejects.toThrow(InvalidBookingTransitionError);
    });

    it('tenant isolation: cannot reschedule a booking from another tenant', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(new Date(futureSlot))
        .build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          scheduledAt: newFutureSlot,
          tenantId: TENANT_A,
          staffId: STAFF_ID,
          correlationId: CORRELATION_ID,
          timezone: 'America/Sao_Paulo',
        }),
      ).rejects.toThrow(BookingNotFoundError);
    });
  });
});
