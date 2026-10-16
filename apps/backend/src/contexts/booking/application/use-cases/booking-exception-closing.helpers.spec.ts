import {
  BookingBuilder,
  FutureCommitmentExceptionBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingStatusTransitionRepository } from '../../../../test/repositories/booking/in-memory-booking-status-transition.repository';
import { InMemoryFutureCommitmentExceptionRepository } from '../../../../test/repositories/booking/in-memory-future-commitment-exception.repository';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { Booking } from '../../domain/booking.aggregate';
import { FutureCommitmentExceptionSourceType } from '../../domain/future-commitment-exception.types';
import { BookingLineOccupancyRow } from '../ports/resource-occupancy-repository.port';
import { ResourceType } from '../../domain/resource.types';
import {
  BOOKING_NO_LONGER_ACTIVE,
  dismissStaleExceptionsAfterMove,
  RESOURCE_NO_LONGER_USED,
  saveTerminalBookingsInTransaction,
} from './booking-exception-closing.helpers';

const TENANT_A = '10000000-0000-4000-8000-000000000501';
const TENANT_B = '10000000-0000-4000-8000-000000000502';
const RESOURCE_A = '30000000-0000-4000-8000-000000000501';
const RESOURCE_B = '30000000-0000-4000-8000-000000000502';
const CORRELATION_ID = 'corr-closing-test';

describe('booking-exception-closing helpers', () => {
  let bookingRepo: InMemoryBookingRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let exceptionRepo: InMemoryFutureCommitmentExceptionRepository;
  let tenantLock: InMemoryTenantLock;
  let order: string[];

  const deps = () => ({ bookingRepo, occupancyRepo, exceptionRepo, tenantLock });

  const seedOccupancy = (booking: Booking, resourceId: string): void => {
    occupancyRepo.seed(TENANT_A, booking.lines[0].lineId, {
      resourceId,
      resourceType: ResourceType.STAFF,
      resourceName: 'Resource',
      legIndex: null,
      quantityPosition: null,
      selectionMode: 'NONE' as const,
      isBundleMember: false,
      gapMinutes: null,
      gapSource: null,
      startsAt: new Date('2026-06-01T13:00:00.000Z'),
      endsAt: new Date('2026-06-01T13:30:00.000Z'),
    });
  };

  const seedEntry = async (booking: Booking, sourceId: string, tenantId = TENANT_A) => {
    const entry = new FutureCommitmentExceptionBuilder()
      .withTenantId(tenantId)
      .withAffectedId(booking.id)
      .withSourceId(sourceId)
      .build();
    await exceptionRepo.save(entry);
    return entry;
  };

  const seedBooking = async (): Promise<Booking> => {
    const booking = new BookingBuilder().withTenantId(TENANT_A).build();
    await bookingRepo.save(booking);
    return booking;
  };

  beforeEach(() => {
    order = [];
    bookingRepo = new InMemoryBookingRepository(
      new InMemoryEventBus(),
      new InMemoryBookingStatusTransitionRepository(),
    );
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    exceptionRepo = new InMemoryFutureCommitmentExceptionRepository();
    tenantLock = new InMemoryTenantLock();
    jest.spyOn(tenantLock, 'lockResources').mockImplementation(async () => {
      order.push('lock-resources');
    });
    jest.spyOn(exceptionRepo, 'findOpenByAffectedForUpdate');
    jest.spyOn(bookingRepo, 'save');
    jest.spyOn(occupancyRepo, 'release');
  });

  describe('saveTerminalBookingsInTransaction', () => {
    it('closes every open entry of a cancelled booking with the system reason and no actor', async () => {
      const booking = await seedBooking();
      seedOccupancy(booking, RESOURCE_A);
      const first = await seedEntry(booking, RESOURCE_A);
      const second = await seedEntry(booking, RESOURCE_B);
      booking.cancel({ type: 'STAFF', id: 'staff-1' }, CORRELATION_ID);

      await saveTerminalBookingsInTransaction(deps(), {
        tenantId: TENANT_A,
        bookings: [booking],
        correlationId: CORRELATION_ID,
      });

      for (const id of [first.id, second.id]) {
        const closed = await exceptionRepo.findById(id, TENANT_A);
        expect(closed?.status).toBe('DISMISSED');
        expect(closed?.resolutionReason).toBe(BOOKING_NO_LONGER_ACTIVE);
        expect(closed?.resolvedByStaffId).toBeNull();
      }
    });

    it('leaves the entry the caller excluded untouched', async () => {
      const booking = await seedBooking();
      seedOccupancy(booking, RESOURCE_A);
      const selected = await seedEntry(booking, RESOURCE_A);
      const sibling = await seedEntry(booking, RESOURCE_B);
      booking.cancel({ type: 'STAFF', id: 'staff-1' }, CORRELATION_ID);

      await saveTerminalBookingsInTransaction(deps(), {
        tenantId: TENANT_A,
        bookings: [booking],
        correlationId: CORRELATION_ID,
        excludeExceptionIds: [selected.id],
      });

      expect((await exceptionRepo.findById(selected.id, TENANT_A))?.status).toBe('OPEN');
      expect((await exceptionRepo.findById(sibling.id, TENANT_A))?.status).toBe('DISMISSED');
    });

    it('still saves the booking and frees its occupancy when it has no open entries', async () => {
      const booking = await seedBooking();
      seedOccupancy(booking, RESOURCE_A);
      booking.cancel({ type: 'STAFF', id: 'staff-1' }, CORRELATION_ID);

      await saveTerminalBookingsInTransaction(deps(), {
        tenantId: TENANT_A,
        bookings: [booking],
        correlationId: CORRELATION_ID,
      });

      expect(bookingRepo.save).toHaveBeenCalledWith(booking);
      expect(occupancyRepo.release).toHaveBeenCalledWith(TENANT_A, [booking.lines[0].lineId]);
      expect(await exceptionRepo.findByTenant(TENANT_A)).toEqual([]);
    });

    it('takes the resource lock, then the entry lock, then saves the booking, then frees the occupancy', async () => {
      const booking = await seedBooking();
      seedOccupancy(booking, RESOURCE_A);
      await seedEntry(booking, RESOURCE_A);
      booking.cancel({ type: 'STAFF', id: 'staff-1' }, CORRELATION_ID);
      (exceptionRepo.findOpenByAffectedForUpdate as jest.Mock).mockImplementationOnce(async () => {
        order.push('lock-entries');
        return [];
      });
      (bookingRepo.save as jest.Mock).mockImplementationOnce(async () => {
        order.push('save-booking');
      });
      (occupancyRepo.release as jest.Mock).mockImplementationOnce(async () => {
        order.push('release');
      });

      await saveTerminalBookingsInTransaction(deps(), {
        tenantId: TENANT_A,
        bookings: [booking],
        correlationId: CORRELATION_ID,
      });

      expect(order).toEqual(['lock-resources', 'lock-entries', 'save-booking', 'release']);
    });

    it('locks again, as a union, when the occupied set grew between the read and the lock', async () => {
      const booking = await seedBooking();
      const read = jest.spyOn(occupancyRepo, 'findOccupancyByBookingLines');
      const rowFor = (resourceId: string): BookingLineOccupancyRow => ({
        bookingLineId: booking.lines[0].lineId,
        resourceId,
        resourceType: ResourceType.STAFF,
        resourceName: 'Resource',
        legIndex: null,
        quantityPosition: null,
        startsAt: new Date('2026-06-01T13:00:00.000Z'),
        endsAt: new Date('2026-06-01T13:30:00.000Z'),
        lockState: 'COMMITTED',
        holdExpiresAt: null,
        gapMinutes: null,
        gapSource: null,
      });
      read
        .mockResolvedValueOnce([rowFor(RESOURCE_A)])
        .mockResolvedValueOnce([rowFor(RESOURCE_A), rowFor(RESOURCE_B)]);
      booking.cancel({ type: 'STAFF', id: 'staff-1' }, CORRELATION_ID);

      await saveTerminalBookingsInTransaction(deps(), {
        tenantId: TENANT_A,
        bookings: [booking],
        correlationId: CORRELATION_ID,
      });

      expect(tenantLock.lockResources).toHaveBeenNthCalledWith(1, TENANT_A, [RESOURCE_A]);
      expect(tenantLock.lockResources).toHaveBeenNthCalledWith(2, TENANT_A, [
        RESOURCE_A,
        RESOURCE_B,
      ]);
    });

    it('takes one resource lock call and one entry query for several bookings', async () => {
      const bookings = [await seedBooking(), await seedBooking()];
      seedOccupancy(bookings[0], RESOURCE_A);
      seedOccupancy(bookings[1], RESOURCE_B);
      for (const booking of bookings) booking.cancel({ type: 'STAFF', id: 's' }, CORRELATION_ID);

      await saveTerminalBookingsInTransaction(deps(), {
        tenantId: TENANT_A,
        bookings,
        correlationId: CORRELATION_ID,
      });

      expect(tenantLock.lockResources).toHaveBeenCalledTimes(1);
      expect(exceptionRepo.findOpenByAffectedForUpdate).toHaveBeenCalledTimes(1);
      expect(exceptionRepo.findOpenByAffectedForUpdate).toHaveBeenCalledWith(
        TENANT_A,
        'BOOKING',
        bookings.map((b) => b.id),
      );
    });

    it("never closes another tenant's entry for the same booking id", async () => {
      const booking = await seedBooking();
      const foreign = await seedEntry(booking, RESOURCE_A, TENANT_B);
      booking.cancel({ type: 'STAFF', id: 'staff-1' }, CORRELATION_ID);

      await saveTerminalBookingsInTransaction(deps(), {
        tenantId: TENANT_A,
        bookings: [booking],
        correlationId: CORRELATION_ID,
      });

      expect((await exceptionRepo.findById(foreign.id, TENANT_B))?.status).toBe('OPEN');
    });
  });

  describe('dismissStaleExceptionsAfterMove', () => {
    it('keeps the entry whose resource the booking still occupies and closes the other', async () => {
      const booking = await seedBooking();
      seedOccupancy(booking, RESOURCE_A);
      const stillUsed = await seedEntry(booking, RESOURCE_A);
      const stale = await seedEntry(booking, RESOURCE_B);

      await dismissStaleExceptionsAfterMove(deps(), {
        tenantId: TENANT_A,
        booking,
        exceptions: [stillUsed, stale],
        correlationId: CORRELATION_ID,
      });

      expect((await exceptionRepo.findById(stillUsed.id, TENANT_A))?.status).toBe('OPEN');
      const closed = await exceptionRepo.findById(stale.id, TENANT_A);
      expect(closed?.status).toBe('DISMISSED');
      expect(closed?.resolutionReason).toBe(RESOURCE_NO_LONGER_USED);
      expect(closed?.resolvedByStaffId).toBeNull();
    });

    it('leaves an entry of an unknown source type open (negative guarantee)', async () => {
      const booking = await seedBooking();
      const entry = await seedEntry(booking, RESOURCE_B);
      // A value read from the database that the code does not know.
      const unknownSource: string = 'FUTURE_SOURCE';
      jest
        .spyOn(entry, 'sourceType', 'get')
        .mockReturnValue(unknownSource as FutureCommitmentExceptionSourceType);

      await dismissStaleExceptionsAfterMove(deps(), {
        tenantId: TENANT_A,
        booking,
        exceptions: [entry],
        correlationId: CORRELATION_ID,
      });

      expect((await exceptionRepo.findById(entry.id, TENANT_A))?.status).toBe('OPEN');
    });

    it('does not read the occupancy when the booking has no open entries', async () => {
      const booking = await seedBooking();
      const read = jest.spyOn(occupancyRepo, 'findOccupancyByBookingLines');

      await dismissStaleExceptionsAfterMove(deps(), {
        tenantId: TENANT_A,
        booking,
        exceptions: [],
        correlationId: CORRELATION_ID,
      });

      expect(read).not.toHaveBeenCalled();
    });

    it('leaves the excluded entry open even when its resource is no longer occupied', async () => {
      const booking = await seedBooking();
      const selected = await seedEntry(booking, RESOURCE_B);

      await dismissStaleExceptionsAfterMove(deps(), {
        tenantId: TENANT_A,
        booking,
        exceptions: [selected],
        correlationId: CORRELATION_ID,
        excludeExceptionIds: [selected.id],
      });

      expect((await exceptionRepo.findById(selected.id, TENANT_A))?.status).toBe('OPEN');
    });

    it('closes an entry once: a second run finds nothing left to dismiss', async () => {
      const booking = await seedBooking();
      const stale = await seedEntry(booking, RESOURCE_B);
      const params = {
        tenantId: TENANT_A,
        booking,
        correlationId: CORRELATION_ID,
      };

      await dismissStaleExceptionsAfterMove(deps(), { ...params, exceptions: [stale] });
      const open = await exceptionRepo.findOpenByAffectedForUpdate(TENANT_A, 'BOOKING', [
        booking.id,
      ]);
      await dismissStaleExceptionsAfterMove(deps(), { ...params, exceptions: open });

      expect(open).toEqual([]);
    });
  });
});
