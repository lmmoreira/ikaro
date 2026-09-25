import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { createAutoBookingResourceFixtures } from '../../../../test/repositories/booking/auto-degenerate-fixtures';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import {
  BookingBuilder,
  BookingLineBuilder,
  ResourceBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import { futureDate } from '../../../../test/utils/date-helpers';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { BookingStatus } from '../../domain/booking.aggregate';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import {
  BookingNotFoundError,
  BookingSlotUnavailableError,
  InvalidBookingTransitionError,
  BookingScheduledAtInvalidError,
  BookingScheduledInPastError,
} from '../../domain/errors/booking-domain.error';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import { ApproveBookingUseCase } from './approve-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000201';
const TENANT_B = '10000000-0000-4000-8000-000000000202';
const STAFF_ID = '20000000-0000-4000-8000-000000000201';
const CORRELATION_ID = 'corr-approve-test';
const TZ = 'America/Sao_Paulo';

const scheduledAt = new Date(`${futureDate(2)}T13:00:00.000Z`);

const ctx = { tenantId: TENANT_A, staffId: STAFF_ID, correlationId: CORRELATION_ID, timezone: TZ };

describe('ApproveBookingUseCase', () => {
  describe('approve()', () => {
    let bookingRepo: InMemoryBookingRepository;
    let eventBus: InMemoryEventBus;
    let fixtures: ReturnType<typeof createAutoBookingResourceFixtures>;
    let occupancyRepo: InMemoryResourceOccupancyRepository;
    let useCase: ApproveBookingUseCase;

    beforeEach(() => {
      eventBus = new InMemoryEventBus();
      bookingRepo = new InMemoryBookingRepository(eventBus);
      fixtures = createAutoBookingResourceFixtures();
      occupancyRepo = new InMemoryResourceOccupancyRepository();
      useCase = new ApproveBookingUseCase(
        bookingRepo,
        fixtures.serviceRepo,
        fixtures.resourceRepo,
        occupancyRepo,
        new AvailabilityService(),
        new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock()),
        new InMemoryTransactionManager(),
      );
    });

    it('transitions PENDING → APPROVED and returns result', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id, ...ctx });

      expect(result.status).toBe(BookingStatus.APPROVED);
      expect(result.bookingId).toBe(booking.id);
      expect(result.approvedAt).toBeDefined();
    });

    it('transitions INFO_REQUESTED → APPROVED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .withStatus(BookingStatus.INFO_REQUESTED)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id, ...ctx });

      expect(result.status).toBe(BookingStatus.APPROVED);
    });

    it('persists the approved status to the repository', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.status).toBe(BookingStatus.APPROVED);
      expect(saved!.approvedBy).toBe(STAFF_ID);
      expect(saved!.approvedAt).not.toBeNull();
    });

    it('commits the HOLD occupancy row(s) to COMMITTED on approval', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
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
            startsAt: scheduledAt,
            endsAt: new Date(scheduledAt.getTime() + 30 * 60_000),
          },
        ],
        'HOLD',
        new Date(Date.now() + 30 * 60_000),
      );

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const conflicting = await occupancyRepo.findConflictingResourceIds(TENANT_A, [
        {
          resourceId: resource.id,
          startsAt: scheduledAt,
          endsAt: new Date(scheduledAt.getTime() + 30 * 60_000),
        },
      ]);
      expect(conflicting).toEqual([resource.id]); // still occupied (now COMMITTED), just not HOLD anymore
    });

    // Approval re-resolves AUTO_ANY fresh (comment above on
    // ApproveBookingUseCase.resolveAndCheckCandidates) — without excluding the booking's OWN
    // existing HOLD from countActiveByResource, that HOLD counts as "workload" against the very
    // resource it's already holding, biasing the tie-break toward reassigning to a different
    // resource for no real reason. ownResource/tieBreakWinner are assigned by actual id comparison
    // (not hardcoded) so a self-counting bug deterministically loses the tie-break to the wrong
    // resource, rather than passing or failing by incidental uuidv7 ordering.
    it("excludes the booking's own HOLD from the AUTO_ANY workload tie-break on approval", async () => {
      const resourceX = new ResourceBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.ROOM)
        .build();
      const resourceY = new ResourceBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.ROOM)
        .build();
      await fixtures.resourceRepo.save(resourceX);
      await fixtures.resourceRepo.save(resourceY);
      const [tieBreakWinner, ownResource] = [resourceX, resourceY].sort((a, b) =>
        a.id.localeCompare(b.id),
      );

      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withBufferAfterMinutes(0)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.ROOM,
            selectionMode: 'AUTO_ANY',
            resourcePoolIds: [ownResource.id, tieBreakWinner.id],
          }),
        ])
        .build();
      await fixtures.serviceRepo.save(service);

      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .withLines([new BookingLineBuilder().withServiceId(service.id).build()])
        .build();
      await bookingRepo.save(booking);

      const windowEnd = new Date(scheduledAt.getTime() + 30 * 60_000);
      // The booking's own existing HOLD, on ownResource — must be excluded from its own count.
      await occupancyRepo.assign(
        TENANT_A,
        booking.lines[0].lineId,
        [
          {
            resourceId: ownResource.id,
            resourceType: ResourceType.ROOM,
            resourceName: ownResource.name,
            legIndex: null,
            quantityPosition: null,
            selectionMode: 'AUTO_ANY' as const,
            isBundleMember: false,
            startsAt: scheduledAt,
            endsAt: windowEnd,
          },
        ],
        'HOLD',
        new Date(Date.now() + 30 * 60_000),
      );
      // A genuinely unrelated OTHER booking's occupancy on tieBreakWinner — real external workload.
      await occupancyRepo.assign(
        TENANT_A,
        'other-booking-line',
        [
          {
            resourceId: tieBreakWinner.id,
            resourceType: ResourceType.ROOM,
            resourceName: tieBreakWinner.name,
            legIndex: null,
            quantityPosition: null,
            selectionMode: 'AUTO_ANY' as const,
            isBundleMember: false,
            startsAt: scheduledAt,
            endsAt: windowEnd,
          },
        ],
        'COMMITTED',
        null,
      );

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const assignments = await occupancyRepo.findAssignmentsByBookingLines(TENANT_A, [
        booking.lines[0].lineId,
      ]);
      expect(assignments).toHaveLength(1);
      expect(assignments[0].resourceId).toBe(ownResource.id);
    });

    it('assigns a fresh COMMITTED occupancy row when the booking has no existing assignment at all (pre-M22-S03 legacy booking)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      // No occupancyRepo.assign() call here — simulates a booking created before M22-S03 shipped
      // (or one BackfillResourceOccupancy skipped because it wasn't APPROVED yet), which never
      // got a REQUESTED/HOLD row through the normal request-time write path.

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const conflicting = await occupancyRepo.findConflictingResourceIds(TENANT_A, [
        {
          resourceId: resource.id,
          startsAt: scheduledAt,
          endsAt: new Date(scheduledAt.getTime() + booking.totalDurationMins * 60_000),
        },
      ]);
      expect(conflicting).toEqual([resource.id]);
    });

    it('commits occupancy for the freshly re-resolved resource, not a stale existing assignment, when the two diverge', async () => {
      const staleResource = new ResourceBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.ROOM)
        .build();
      const freshResource = new ResourceBuilder()
        .withTenantId(TENANT_A)
        .withType(ResourceType.ROOM)
        .build();
      await fixtures.resourceRepo.save(staleResource);
      await fixtures.resourceRepo.save(freshResource);
      const serviceId = '30000000-0000-4000-8000-000000000301';
      const service = new ServiceBuilder()
        .withId(serviceId)
        .withTenantId(TENANT_A)
        .withDurationMinutes(30)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();
      await fixtures.serviceRepo.save(service);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .withLines([new BookingLineBuilder().withServiceId(serviceId).build()])
        .build();
      await bookingRepo.save(booking);
      const bookingLineId = booking.lines[0].lineId;
      const windowEnd = new Date(scheduledAt.getTime() + 30 * 60_000);
      // Simulates request-time resolution having picked staleResource (the only active ROOM at
      // that moment), followed by an admin deactivating it before staff approves.
      await occupancyRepo.assign(
        TENANT_A,
        bookingLineId,
        [
          {
            resourceId: staleResource.id,
            resourceType: ResourceType.ROOM,
            resourceName: staleResource.name,
            legIndex: null,
            quantityPosition: null,
            selectionMode: 'NONE' as const,
            isBundleMember: false,
            startsAt: scheduledAt,
            endsAt: windowEnd,
          },
        ],
        'HOLD',
        new Date(Date.now() + 30 * 60_000),
      );
      staleResource.deactivate();
      await fixtures.resourceRepo.save(staleResource);

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const staleConflicting = await occupancyRepo.findConflictingResourceIds(TENANT_A, [
        { resourceId: staleResource.id, startsAt: scheduledAt, endsAt: windowEnd },
      ]);
      expect(staleConflicting).toEqual([]);
      const freshConflicting = await occupancyRepo.findConflictingResourceIds(TENANT_A, [
        { resourceId: freshResource.id, startsAt: scheduledAt, endsAt: windowEnd },
      ]);
      expect(freshConflicting).toEqual([freshResource.id]);
    });

    it('allows approving with an alternate scheduledAt after a slot conflict', async () => {
      const originalScheduledAt = new Date(`${futureDate(2)}T13:00:00.000Z`);
      const retryScheduledAt = new Date(`${futureDate(2)}T14:00:00.000Z`);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(originalScheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        scheduledAt: retryScheduledAt.toISOString(),
        ...ctx,
      });

      expect(result.status).toBe(BookingStatus.APPROVED);

      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.scheduledAt.toISOString()).toBe(retryScheduledAt.toISOString());
    });

    it('publishes BookingApproved event with serviceNameAtBooking in lineSummary', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id, ...ctx });

      const events = eventBus.published;
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('BookingApproved');
      const data = events[0].data as { lineSummary: { serviceNameAtBooking: string }[] };
      expect(data.lineSummary[0].serviceNameAtBooking).toBeDefined();
    });

    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({ bookingId: '00000000-0000-4000-8000-000000000000', ...ctx }),
      ).rejects.toThrow(BookingNotFoundError);
    });

    it('throws InvalidBookingTransitionError when booking is COMPLETED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .withStatus(BookingStatus.COMPLETED)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('throws InvalidBookingTransitionError when booking is REJECTED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .withStatus(BookingStatus.REJECTED)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('throws InvalidBookingTransitionError when booking is CANCELLED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .withStatus(BookingStatus.CANCELLED)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        InvalidBookingTransitionError,
      );
    });

    it('throws BookingSlotUnavailableError when slot overlaps an approved booking', async () => {
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      occupancyRepo.seed(TENANT_A, 'other-line-id', {
        resourceId: resource.id,
        resourceType: ResourceType.LOCATION,
        resourceName: resource.name,
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'NONE' as const,
        isBundleMember: false,
        startsAt: scheduledAt,
        endsAt: new Date(scheduledAt.getTime() + 60 * 60_000),
      });
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        BookingSlotUnavailableError,
      );
    });

    it('allows approval when existing slot is non-overlapping (adjacent)', async () => {
      const resource = fixtures.resourceRepo.ensureLocation(TENANT_A);
      const otherSlotAt = new Date(scheduledAt.getTime() + 30 * 60_000);
      occupancyRepo.seed(TENANT_A, 'other-line-id', {
        resourceId: resource.id,
        resourceType: ResourceType.LOCATION,
        resourceName: resource.name,
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'NONE' as const,
        isBundleMember: false,
        startsAt: otherSlotAt,
        endsAt: new Date(otherSlotAt.getTime() + 30 * 60_000),
      });
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id, ...ctx });
      expect(result.status).toBe(BookingStatus.APPROVED);
    });

    it('throws BookingScheduledInPastError when retrying with a past scheduledAt', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      const pastScheduledAt = new Date(Date.now() - 60_000).toISOString();

      await expect(
        useCase.execute({ bookingId: booking.id, scheduledAt: pastScheduledAt, ...ctx }),
      ).rejects.toThrow(BookingScheduledInPastError);
    });

    it('throws BookingScheduledAtInvalidError when scheduledAt is malformed', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({ bookingId: booking.id, scheduledAt: 'not-a-date', ...ctx }),
      ).rejects.toThrow(BookingScheduledAtInvalidError);
    });

    it('tenant isolation: cannot approve booking from another tenant', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        BookingNotFoundError,
      );
    });

    it('logs "Booking approved" with tenantId, bookingId, and staffId', async () => {
      const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(scheduledAt)
        .build();
      await bookingRepo.save(booking);

      await useCase.execute({ bookingId: booking.id, ...ctx });

      expect(logSpy).toHaveBeenCalledWith('Booking approved', {
        tenantId: TENANT_A,
        bookingId: booking.id,
        staffId: STAFF_ID,
      });
    });
  });
});
