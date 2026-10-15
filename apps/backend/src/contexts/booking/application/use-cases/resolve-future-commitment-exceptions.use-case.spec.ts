import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingQuoteRevisionRepository } from '../../../../test/repositories/booking/in-memory-booking-quote-revision.repository';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import {
  FCE_OTHER_TENANT_ID,
  FCE_TENANT_ID as TENANT_ID,
  FutureCommitmentFixture,
} from '../../../../test/utils/future-commitment-fixture';
import { DomainEvent } from '../../../../shared/domain/domain-event';
import { FutureCommitmentExceptionBuilder } from '../../../../test/builders/booking/index';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingResourceReassigned } from '../../domain/events/booking-resource-reassigned.event';
import { ResourceType } from '../../domain/resource.types';
import { AvailabilityService } from '../../domain/services/availability.service';
import { BookingSlotConflictService } from '../services/booking-slot-conflict.service';
import {
  ResolveFutureCommitmentExceptionsUseCase,
  ResolveFutureCommitmentExceptionsUseCaseInput,
} from './resolve-future-commitment-exceptions.use-case';

const STAFF_ID = '00000000-0000-7000-8000-0000000000aa';
const CORRELATION_ID = 'corr-resolve-1';

describe('ResolveFutureCommitmentExceptionsUseCase', () => {
  let world: FutureCommitmentFixture;
  let useCase: ResolveFutureCommitmentExceptionsUseCase;
  let published: DomainEvent[];

  // Only Date is faked, pinned to 09:00 in the tenant timezone: the AUTO tie-break compares the
  // workload of the booking's local calendar day, so "+48h" and "+51h" must fall on the same day
  // whatever time the suite runs at.
  beforeEach(() => {
    jest.useFakeTimers({
      now: new Date('2027-03-10T12:00:00Z'),
      doNotFake: [
        'nextTick',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
        'queueMicrotask',
        'performance',
        'hrtime',
      ],
    });
    published = [];
    world = new FutureCommitmentFixture({
      publish: async (event) => {
        published.push(event as DomainEvent);
      },
    });
    useCase = new ResolveFutureCommitmentExceptionsUseCase(
      world.exceptionRepo,
      world.bookingRepo,
      world.serviceRepo,
      world.resourceRepo,
      world.occupancyRepo,
      new InMemoryBookingQuoteRevisionRepository(),
      new InMemoryRecurringBookingScheduleRepository(),
      world.tenantLock,
      new InMemoryTransactionManager(),
      new AvailabilityService(),
      new BookingSlotConflictService(world.occupancyRepo, world.tenantLock),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Raises the worklist the way a real deactivation would: seed the bookings, deactivate the
  // source, run the shared raise step.
  async function raiseFor(resourceId: string): Promise<string[]> {
    const resource = (await world.resourceRepo.findById(resourceId, TENANT_ID))!;
    resource.deactivate();
    await world.resourceRepo.save(resource);
    await world.raise.execute({ tenantId: TENANT_ID, resourceId, correlationId: CORRELATION_ID });
    const entries = await world.exceptionRepo.findByTenant(TENANT_ID, { status: 'OPEN' });
    return entries.sort((a, b) => a.affectedId.localeCompare(b.affectedId)).map((e) => e.id);
  }

  const resolve = (
    overrides: Partial<ResolveFutureCommitmentExceptionsUseCaseInput> &
      Pick<ResolveFutureCommitmentExceptionsUseCaseInput, 'exceptionIds' | 'resolutionType'>,
  ) =>
    useCase.execute({
      tenantId: TENANT_ID,
      staffId: STAFF_ID,
      actorRole: 'STAFF',
      correlationId: CORRELATION_ID,
      timezone: 'America/Sao_Paulo',
      ...overrides,
    });

  async function occupiedResourceIds(bookingId: string): Promise<string[]> {
    const booking = (await world.bookingRepo.findById(bookingId, TENANT_ID))!;
    const rows = await world.occupancyRepo.findOccupancyByBookingLines(
      TENANT_ID,
      booking.lines.map((l) => l.lineId),
    );
    return rows.map((r) => r.resourceId);
  }

  describe('KEEP', () => {
    it('resolves the entry and leaves the booking and its occupancy untouched', async () => {
      const source = await world.addResource('Sala 1');
      const service = await world.addService();
      const booking = await world.addBooking({ service, resource: source });
      const [entryId] = await raiseFor(source.id);

      const { results } = await resolve({
        exceptionIds: [entryId],
        resolutionType: 'KEEP',
        reason: 'the customer will use another room',
      });

      expect(results).toEqual([{ exceptionId: entryId, outcome: 'RESOLVED' }]);
      const entry = (await world.exceptionRepo.findById(entryId, TENANT_ID))!;
      expect(entry.status).toBe('RESOLVED');
      expect(entry.resolutionType).toBe('KEEP');
      expect(entry.resolutionReason).toBe('the customer will use another room');
      expect(entry.resolvedByStaffId).toBe(STAFF_ID);
      expect((await world.bookingRepo.findById(booking.id, TENANT_ID))!.status).toBe(
        BookingStatus.APPROVED,
      );
      expect(await occupiedResourceIds(booking.id)).toEqual([source.id]);
    });
  });

  describe('CANCEL', () => {
    it('cancels the booking as staff, releases its occupancy and resolves the entry', async () => {
      const source = await world.addResource('Sala 1');
      const service = await world.addService();
      const booking = await world.addBooking({ service, resource: source });
      const [entryId] = await raiseFor(source.id);

      const { results } = await resolve({
        exceptionIds: [entryId],
        resolutionType: 'CANCEL',
        reason: 'room closed',
      });

      expect(results[0].outcome).toBe('RESOLVED');
      const cancelled = (await world.bookingRepo.findById(booking.id, TENANT_ID))!;
      expect(cancelled.status).toBe(BookingStatus.CANCELLED);
      expect(cancelled.cancelledBy).toBe(STAFF_ID);
      expect(cancelled.cancellationReason).toBe('room closed');
      expect(await occupiedResourceIds(booking.id)).toEqual([]);
      expect((await world.exceptionRepo.findById(entryId, TENANT_ID))!.resolutionType).toBe(
        'CANCEL',
      );
    });

    it('keeps the entry open when the booking can no longer be cancelled', async () => {
      const source = await world.addResource('Sala 1');
      const service = await world.addService();
      const booking = await world.addBooking({ service, resource: source });
      const [entryId] = await raiseFor(source.id);
      const stored = (await world.bookingRepo.findById(booking.id, TENANT_ID))!;
      stored.cancel({ type: 'STAFF', id: STAFF_ID }, CORRELATION_ID);
      await world.bookingRepo.save(stored);

      const { results } = await resolve({ exceptionIds: [entryId], resolutionType: 'CANCEL' });

      expect(results).toEqual([
        {
          exceptionId: entryId,
          outcome: 'STILL_OPEN',
          errorCode: BookingErrorCode.INVALID_TRANSITION,
        },
      ]);
      expect((await world.exceptionRepo.findById(entryId, TENANT_ID))!.status).toBe('OPEN');
    });
    describe('sibling entries of the same booking (M23-S48)', () => {
      // A booking whose second resource was deactivated at another time: a second OPEN entry about
      // the same booking, which no cancel through the worklist used to touch.
      async function addSiblingEntry(bookingId: string): Promise<string> {
        const other = await world.addResource('Sala 2');
        const sibling = new FutureCommitmentExceptionBuilder()
          .withTenantId(TENANT_ID)
          .withAffectedId(bookingId)
          .withSourceId(other.id)
          .build();
        await world.exceptionRepo.save(sibling);
        return sibling.id;
      }

      it('resolves the selected entry as the manager and dismisses the sibling as the system', async () => {
        const source = await world.addResource('Sala 1');
        const service = await world.addService();
        const booking = await world.addBooking({ service, resource: source });
        const [entryId] = await raiseFor(source.id);
        const siblingId = await addSiblingEntry(booking.id);

        await resolve({ exceptionIds: [entryId], resolutionType: 'CANCEL', reason: 'closed' });

        const selected = (await world.exceptionRepo.findById(entryId, TENANT_ID))!;
        expect(selected.status).toBe('RESOLVED');
        expect(selected.resolvedByStaffId).toBe(STAFF_ID);
        const sibling = (await world.exceptionRepo.findById(siblingId, TENANT_ID))!;
        expect(sibling.status).toBe('DISMISSED');
        expect(sibling.resolutionReason).toBe('BOOKING_NO_LONGER_ACTIVE');
        expect(sibling.resolvedByStaffId).toBeNull();
      });

      it('reports both ids of a bulk cancel as resolved, not the second as still open', async () => {
        const source = await world.addResource('Sala 1');
        const service = await world.addService();
        const booking = await world.addBooking({ service, resource: source });
        const [entryId] = await raiseFor(source.id);
        const siblingId = await addSiblingEntry(booking.id);

        const { results } = await resolve({
          exceptionIds: [entryId, siblingId],
          resolutionType: 'CANCEL',
        });

        expect(results).toEqual([
          { exceptionId: entryId, outcome: 'RESOLVED' },
          { exceptionId: siblingId, outcome: 'RESOLVED' },
        ]);
        expect((await world.bookingRepo.findById(booking.id, TENANT_ID))!.status).toBe(
          BookingStatus.CANCELLED,
        );
      });

      it('still reports a closed entry as still open when its booking was not cancelled', async () => {
        const source = await world.addResource('Sala 1');
        const service = await world.addService();
        const booking = await world.addBooking({ service, resource: source });
        const [entryId] = await raiseFor(source.id);
        await resolve({ exceptionIds: [entryId], resolutionType: 'KEEP' });

        const { results } = await resolve({ exceptionIds: [entryId], resolutionType: 'CANCEL' });

        expect(results[0].outcome).toBe('STILL_OPEN');
        expect((await world.bookingRepo.findById(booking.id, TENANT_ID))!.status).toBe(
          BookingStatus.APPROVED,
        );
      });

      it('takes the resource locks before the entry row lock', async () => {
        const source = await world.addResource('Sala 1');
        const service = await world.addService();
        await world.addBooking({ service, resource: source });
        const [entryId] = await raiseFor(source.id);
        const order: string[] = [];
        const lockResources = world.tenantLock.lockResources.bind(world.tenantLock);
        jest.spyOn(world.tenantLock, 'lockResources').mockImplementation((tenantId, ids) => {
          order.push('lock-resources');
          return lockResources(tenantId, ids);
        });
        const lockEntry = world.exceptionRepo.findByIdForUpdate.bind(world.exceptionRepo);
        jest.spyOn(world.exceptionRepo, 'findByIdForUpdate').mockImplementation((id, tenantId) => {
          order.push('lock-entry');
          return lockEntry(id, tenantId);
        });

        await resolve({ exceptionIds: [entryId], resolutionType: 'CANCEL' });

        expect(order.indexOf('lock-resources')).toBeGreaterThanOrEqual(0);
        expect(order.indexOf('lock-resources')).toBeLessThan(order.indexOf('lock-entry'));
      });
    });
  });

  describe('REASSIGN', () => {
    it('moves the occupancy to the chosen resource at the same window and leaves the booking untouched', async () => {
      const source = await world.addResource('Sala 1');
      const target = await world.addResource('Sala 2');
      const service = await world.addService();
      const booking = await world.addBooking({ service, resource: source });
      const scheduledAt = booking.scheduledAt.getTime();
      const [before] = await world.occupancyRepo.findOccupancyByBookingLines(
        TENANT_ID,
        booking.lines.map((l) => l.lineId),
      );
      const [entryId] = await raiseFor(source.id);

      const { results } = await resolve({
        exceptionIds: [entryId],
        resolutionType: 'REASSIGN',
        target: { resourceId: target.id },
      });

      expect(results[0].outcome).toBe('RESOLVED');
      const [after] = await world.occupancyRepo.findOccupancyByBookingLines(
        TENANT_ID,
        booking.lines.map((l) => l.lineId),
      );
      expect(after.resourceId).toBe(target.id);
      expect(after.resourceName).toBe('Sala 2');
      expect(after.startsAt).toEqual(before.startsAt);
      expect(after.endsAt).toEqual(before.endsAt);
      expect(after.lockState).toBe(before.lockState);
      const untouched = (await world.bookingRepo.findById(booking.id, TENANT_ID))!;
      expect(untouched.scheduledAt.getTime()).toBe(scheduledAt);
      expect(untouched.status).toBe(BookingStatus.APPROVED);
      expect(untouched.clearDomainEvents()).toHaveLength(0);
    });

    describe('customer notification event (M23-S23)', () => {
      const reassigned = () =>
        published.filter(
          (e): e is BookingResourceReassigned => e instanceof BookingResourceReassigned,
        );

      it('records one BookingResourceReassigned per moved booking, naming the resource when it is disclosed', async () => {
        const source = await world.addResource('Sala 1');
        const target = await world.addResource('Sala 2');
        const service = await world.addService();
        const first = await world.addBooking({ service, resource: source, startsInHours: 48 });
        const second = await world.addBooking({ service, resource: source, startsInHours: 72 });
        const entryIds = await raiseFor(source.id);
        published.length = 0;

        const { results } = await resolve({
          exceptionIds: entryIds,
          resolutionType: 'REASSIGN',
          target: { resourceId: target.id },
          reason: 'Internal: room closed for repairs',
        });

        expect(results.map((r) => r.outcome)).toEqual(['RESOLVED', 'RESOLVED']);
        const events = reassigned();
        expect(events.map((e) => e.data.bookingId).sort()).toEqual([first.id, second.id].sort());
        for (const event of events) {
          expect(event.data.newResourceName).toBe('Sala 2');
          expect(event.data.reassignedBy).toBe(STAFF_ID);
          expect(event.correlationId).toBe(CORRELATION_ID);
          expect(JSON.stringify(event.data)).not.toContain('repairs');
        }
        expect(published.some((e) => e.eventName === 'BookingRescheduled')).toBe(false);
      });

      it('leaves the resource name out for a fungible-pool requirement', async () => {
        const source = await world.addResource('Sala 1');
        const target = await world.addResource('Sala 2');
        const service = await world.addService(
          ResourceType.ROOM,
          null,
          TENANT_ID,
          'AUTO_FUNGIBLE_POOL',
        );
        await world.addBooking({ service, resource: source });
        const [entryId] = await raiseFor(source.id);
        published.length = 0;

        await resolve({
          exceptionIds: [entryId],
          resolutionType: 'REASSIGN',
          target: { resourceId: target.id },
        });

        expect(reassigned()).toHaveLength(1);
        expect(reassigned()[0].data.newResourceName).toBeNull();
      });

      it('records nothing for an entry that stays open', async () => {
        const source = await world.addResource('Sala 1');
        const service = await world.addService();
        await world.addBooking({ service, resource: source });
        const [entryId] = await raiseFor(source.id);
        published.length = 0;

        const { results } = await resolve({
          exceptionIds: [entryId],
          resolutionType: 'REASSIGN',
          target: { mode: 'AUTO' },
        });

        expect(results[0].outcome).toBe('STILL_OPEN');
        expect(reassigned()).toHaveLength(0);
      });

      it("never records an event for another tenant's entry (tenant isolation)", async () => {
        const source = await world.addResource('Sala 1');
        const target = await world.addResource('Sala 2');
        const service = await world.addService();
        await world.addBooking({ service, resource: source });
        const [entryId] = await raiseFor(source.id);
        published.length = 0;

        const { results } = await resolve({
          tenantId: FCE_OTHER_TENANT_ID,
          exceptionIds: [entryId],
          resolutionType: 'REASSIGN',
          target: { resourceId: target.id },
        });

        expect(results[0]).toMatchObject({
          outcome: 'STILL_OPEN',
          errorCode: BookingErrorCode.EXCEPTION_NOT_FOUND,
        });
        expect(reassigned()).toHaveLength(0);
        expect((await world.exceptionRepo.findById(entryId, TENANT_ID))!.status).toBe('OPEN');
      });

      it('records nothing for KEEP', async () => {
        const source = await world.addResource('Sala 1');
        const service = await world.addService();
        await world.addBooking({ service, resource: source });
        const [entryId] = await raiseFor(source.id);
        published.length = 0;

        await resolve({ exceptionIds: [entryId], resolutionType: 'KEEP' });

        expect(reassigned()).toHaveLength(0);
      });
    });

    it('with AUTO picks the least-loaded free resource of the same type', async () => {
      const source = await world.addResource('Sala 1');
      const busyDay = await world.addResource('Sala 2');
      const idle = await world.addResource('Sala 3');
      const service = await world.addService();
      const booking = await world.addBooking({ service, resource: source, startsInHours: 48 });
      // Sala 2 is free at the booking's window but already carries work on the same day.
      await world.addBooking({ service, resource: busyDay, startsInHours: 51, durationMins: 30 });
      const [entryId] = await raiseFor(source.id);

      const { results } = await resolve({
        exceptionIds: [entryId],
        resolutionType: 'REASSIGN',
        target: { mode: 'AUTO' },
      });

      expect(results[0].outcome).toBe('RESOLVED');
      expect(await occupiedResourceIds(booking.id)).toEqual([idle.id]);
    });

    it('keeps an entry open when AUTO finds every eligible resource busy', async () => {
      const source = await world.addResource('Sala 1');
      const other = await world.addResource('Sala 2');
      const service = await world.addService();
      await world.addBooking({ service, resource: source, startsInHours: 48 });
      await world.addBooking({ service, resource: other, startsInHours: 48 });
      const entryIds = await raiseFor(source.id);

      const { results } = await resolve({
        exceptionIds: entryIds,
        resolutionType: 'REASSIGN',
        target: { mode: 'AUTO' },
      });

      expect(results).toEqual([
        {
          exceptionId: entryIds[0],
          outcome: 'STILL_OPEN',
          errorCode: BookingErrorCode.EXCEPTION_REASSIGN_TARGET_INVALID,
        },
      ]);
    });

    it('bulk: resolves the bookings that fit, keeps the conflicting one open and reports each', async () => {
      const source = await world.addResource('Sala 1');
      const target = await world.addResource('Sala 2');
      const service = await world.addService();
      const bookings = [
        await world.addBooking({ service, resource: source, startsInHours: 24 }),
        await world.addBooking({ service, resource: source, startsInHours: 48 }),
        await world.addBooking({ service, resource: source, startsInHours: 72 }),
      ];
      // Sala 2 is taken exactly when the middle booking happens.
      await world.addBooking({ service, resource: target, startsInHours: 48 });
      const entryIds = await raiseFor(source.id);

      const { results } = await resolve({
        exceptionIds: entryIds,
        resolutionType: 'REASSIGN',
        target: { resourceId: target.id },
      });

      const byEntry = new Map(results.map((r) => [r.exceptionId, r]));
      expect(results).toHaveLength(3);
      const outcomes = results.map((r) => r.outcome).sort();
      expect(outcomes).toEqual(['RESOLVED', 'RESOLVED', 'STILL_OPEN']);
      const stillOpen = results.find((r) => r.outcome === 'STILL_OPEN')!;
      expect(stillOpen.errorCode).toBe(BookingErrorCode.EXCEPTION_REASSIGN_TARGET_INVALID);
      expect((await world.exceptionRepo.findById(stillOpen.exceptionId, TENANT_ID))!.status).toBe(
        'OPEN',
      );
      // The two that fit really moved; the conflicting one stayed on the source.
      const movedIds: string[] = [];
      for (const booking of bookings) {
        const ids = await occupiedResourceIds(booking.id);
        if (ids[0] === target.id) movedIds.push(booking.id);
      }
      expect(movedIds).toHaveLength(2);
      expect(byEntry.size).toBe(3);
    });

    it.each([
      [
        'an inactive resource',
        async (w: FutureCommitmentFixture) => {
          const r = await w.addResource('Inativa');
          r.deactivate();
          await w.resourceRepo.save(r);
          return { target: r, pool: null as string[] | null };
        },
      ],
      [
        'a resource of another type',
        async (w: FutureCommitmentFixture) => ({
          target: await w.addResource('Instrutor', ResourceType.STAFF),
          pool: null as string[] | null,
        }),
      ],
      [
        'a resource outside the requirement pool',
        async (w: FutureCommitmentFixture) => {
          const other = await w.addResource('Fora do pool');
          return { target: other, pool: ['00000000-0000-7000-8000-00000000ffff'] };
        },
      ],
    ])('rejects %s as the target and keeps the entry open', async (_label, makeTarget) => {
      const source = await world.addResource('Sala 1');
      const { target, pool } = await makeTarget(world);
      const service = await world.addService(ResourceType.ROOM, pool ? [...pool, source.id] : null);
      const booking = await world.addBooking({ service, resource: source });
      const [entryId] = await raiseFor(source.id);

      const { results } = await resolve({
        exceptionIds: [entryId],
        resolutionType: 'REASSIGN',
        target: { resourceId: target.id },
      });

      expect(results).toEqual([
        {
          exceptionId: entryId,
          outcome: 'STILL_OPEN',
          errorCode: BookingErrorCode.EXCEPTION_REASSIGN_TARGET_INVALID,
        },
      ]);
      expect(await occupiedResourceIds(booking.id)).toEqual([source.id]);
    });
  });

  describe('RESCHEDULE', () => {
    it('moves an APPROVED booking to the chosen time and re-resolves its resource', async () => {
      const source = await world.addResource('Sala 1');
      const replacement = await world.addResource('Sala 2');
      const service = await world.addService();
      const booking = await world.addBooking({ service, resource: source, startsInHours: 48 });
      const [entryId] = await raiseFor(source.id);
      const newTime = new Date(Date.now() + 96 * 3_600_000).toISOString();

      const { results } = await resolve({
        exceptionIds: [entryId],
        resolutionType: 'RESCHEDULE',
        scheduledAt: newTime,
      });

      expect(results).toEqual([{ exceptionId: entryId, outcome: 'RESOLVED' }]);
      const moved = (await world.bookingRepo.findById(booking.id, TENANT_ID))!;
      expect(moved.scheduledAt.toISOString()).toBe(newTime);
      expect(await occupiedResourceIds(booking.id)).toEqual([replacement.id]);
      expect((await world.exceptionRepo.findById(entryId, TENANT_ID))!.resolutionType).toBe(
        'RESCHEDULE',
      );
    });

    it('refuses a booking that is not APPROVED and keeps the entry open', async () => {
      const source = await world.addResource('Sala 1');
      await world.addResource('Sala 2');
      const service = await world.addService();
      await world.addBooking({
        service,
        resource: source,
        status: BookingStatus.PENDING,
        lockState: 'HOLD',
      });
      const [entryId] = await raiseFor(source.id);

      const { results } = await resolve({
        exceptionIds: [entryId],
        resolutionType: 'RESCHEDULE',
        scheduledAt: new Date(Date.now() + 96 * 3_600_000).toISOString(),
      });

      expect(results).toEqual([
        {
          exceptionId: entryId,
          outcome: 'STILL_OPEN',
          errorCode: BookingErrorCode.INVALID_TRANSITION,
        },
      ]);
    });

    it('refuses a time in the past', async () => {
      const source = await world.addResource('Sala 1');
      const service = await world.addService();
      await world.addBooking({ service, resource: source });
      const [entryId] = await raiseFor(source.id);

      const { results } = await resolve({
        exceptionIds: [entryId],
        resolutionType: 'RESCHEDULE',
        scheduledAt: new Date(Date.now() - 3_600_000).toISOString(),
      });

      expect(results[0]).toEqual({
        exceptionId: entryId,
        outcome: 'STILL_OPEN',
        errorCode: BookingErrorCode.SCHEDULED_IN_PAST,
      });
    });
  });

  describe('per-entry guards', () => {
    it('reports an unknown entry without failing the batch', async () => {
      const source = await world.addResource('Sala 1');
      const service = await world.addService();
      await world.addBooking({ service, resource: source });
      const [entryId] = await raiseFor(source.id);
      const unknown = '00000000-0000-7000-8000-00000000dead';

      const { results } = await resolve({
        exceptionIds: [unknown, entryId],
        resolutionType: 'KEEP',
      });

      expect(results).toEqual([
        {
          exceptionId: unknown,
          outcome: 'STILL_OPEN',
          errorCode: BookingErrorCode.EXCEPTION_NOT_FOUND,
        },
        { exceptionId: entryId, outcome: 'RESOLVED' },
      ]);
    });

    it('never resolves an entry twice', async () => {
      const source = await world.addResource('Sala 1');
      const service = await world.addService();
      await world.addBooking({ service, resource: source });
      const [entryId] = await raiseFor(source.id);
      await resolve({ exceptionIds: [entryId], resolutionType: 'KEEP' });

      const { results } = await resolve({ exceptionIds: [entryId], resolutionType: 'CANCEL' });

      expect(results).toEqual([
        {
          exceptionId: entryId,
          outcome: 'STILL_OPEN',
          errorCode: BookingErrorCode.EXCEPTION_ALREADY_RESOLVED,
        },
      ]);
    });

    it("cannot see another tenant's entry (tenant isolation)", async () => {
      const source = await world.addResource('Sala 1');
      const service = await world.addService();
      await world.addBooking({ service, resource: source });
      const [entryId] = await raiseFor(source.id);

      const { results } = await resolve({
        tenantId: FCE_OTHER_TENANT_ID,
        exceptionIds: [entryId],
        resolutionType: 'CANCEL',
      });

      expect(results[0].errorCode).toBe(BookingErrorCode.EXCEPTION_NOT_FOUND);
      expect((await world.exceptionRepo.findById(entryId, TENANT_ID))!.status).toBe('OPEN');
    });
  });
});
