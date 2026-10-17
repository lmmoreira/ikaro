import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { BookingBuilder } from '../../../../test/builders/booking/booking.builder';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingStatusTransitionRepository } from '../../../../test/repositories/booking/in-memory-booking-status-transition.repository';
import { InMemoryFutureCommitmentExceptionRepository } from '../../../../test/repositories/booking/in-memory-future-commitment-exception.repository';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { seedOccupancy } from '../../../../test/utils/occupancy-seed';
import { APPROVAL_EXPIRED_REASON, Booking, BookingStatus } from '../../domain/booking.aggregate';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { ExpireBookingHoldsJob } from './expire-booking-holds.job';

const TENANT_A = '00000000-0000-7000-8000-00000000000a';
const TENANT_B = '00000000-0000-7000-8000-00000000000b';
const NOW = new Date('2026-10-17T12:00:00.000Z');
const PAST = new Date('2026-10-17T11:30:00.000Z');
const FUTURE = new Date('2026-10-17T12:30:00.000Z');

describe('ExpireBookingHoldsJob', () => {
  let bookingRepo: InMemoryBookingRepository;
  let transitionRepo: InMemoryBookingStatusTransitionRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let platformPort: InMemoryBookingPlatformPort;
  let eventBus: InMemoryEventBus;
  let job: ExpireBookingHoldsJob;

  // A booking with a HOLD row; `holdExpiresAt` is also what the in-memory repository's sweep sees.
  async function seed(
    tenantId: string,
    options: {
      status?: BookingStatus;
      holdExpiresAt?: Date;
      lockState?: 'HOLD' | 'COMMITTED';
    } = {},
  ): Promise<Booking> {
    const booking = new BookingBuilder()
      .withTenantId(tenantId)
      .withStatus(options.status ?? BookingStatus.PENDING)
      .build();
    await bookingRepo.save(booking);
    eventBus.clear();
    const holdExpiresAt = options.holdExpiresAt ?? PAST;
    await seedOccupancy(occupancyRepo, {
      tenantId,
      bookingLineId: booking.lines[0].lineId,
      lockState: options.lockState ?? 'HOLD',
      holdExpiresAt: options.lockState === 'COMMITTED' ? null : holdExpiresAt,
    });
    bookingRepo.seedHoldExpiry(booking.id, holdExpiresAt);
    return booking;
  }

  const statusOf = async (booking: Booking) =>
    (await bookingRepo.findById(booking.id, booking.tenantId))?.status;

  const publishedBookingIds = () =>
    eventBus.published.map((event) => (event.data as { bookingId: string }).bookingId);

  const occupancyOf = (booking: Booking) =>
    occupancyRepo.findOccupancyByBookingLines(
      booking.tenantId,
      booking.lines.map((line) => line.lineId),
    );

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    transitionRepo = new InMemoryBookingStatusTransitionRepository();
    bookingRepo = new InMemoryBookingRepository(eventBus, transitionRepo);
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    platformPort = new InMemoryBookingPlatformPort();
    platformPort.seed([
      { id: TENANT_A, timezone: 'America/Sao_Paulo' },
      { id: TENANT_B, timezone: 'UTC' },
    ]);
    job = new ExpireBookingHoldsJob(
      platformPort,
      bookingRepo,
      occupancyRepo,
      new InMemoryFutureCommitmentExceptionRepository(),
      new InMemoryTenantLock(),
      new InMemoryTransactionManager(),
    );
  });

  it('cancels a PENDING booking past its hold as the system, frees its slot and publishes BookingCancelled', async () => {
    const overdue = await seed(TENANT_A);

    const result = await job.run(NOW);

    expect(result).toEqual({ expired: 1 });
    const saved = await bookingRepo.findById(overdue.id, TENANT_A);
    expect(saved?.status).toBe(BookingStatus.CANCELLED);
    expect(saved?.cancelledBy).toBeNull();
    expect(saved?.cancellationReason).toBe(APPROVAL_EXPIRED_REASON);
    expect(await occupancyOf(overdue)).toEqual([]);
    expect(transitionRepo.all()).toMatchObject([{ actorType: 'SYSTEM', actorId: null }]);
    expect(eventBus.published.map((event) => event.eventName)).toEqual(['BookingCancelled']);
  });

  it('leaves a hold that has not run out untouched', async () => {
    const waiting = await seed(TENANT_A, { holdExpiresAt: FUTURE });

    const result = await job.run(NOW);

    expect(result.expired).toBe(0);
    expect(await statusOf(waiting)).toBe(BookingStatus.PENDING);
    expect(await occupancyOf(waiting)).toHaveLength(1);
    expect(eventBus.published).toHaveLength(0);
  });

  it.each([BookingStatus.INFO_REQUESTED, BookingStatus.APPROVED, BookingStatus.REJECTED])(
    'never expires a %s booking even when its old hold deadline has passed',
    async (status) => {
      const booking = await seed(TENANT_A, { status });

      const result = await job.run(NOW);

      expect(result.expired).toBe(0);
      expect(await statusOf(booking)).toBe(status);
    },
  );

  it('never touches a booking whose occupancy is COMMITTED or has no deadline (REQUESTED and AUTO_CONFIRM)', async () => {
    const committed = await seed(TENANT_A, { lockState: 'COMMITTED' });
    bookingRepo.seedHoldExpiry(committed.id, PAST);

    const result = await job.run(NOW);

    expect(result.expired).toBe(0);
    expect(await statusOf(committed)).toBe(BookingStatus.PENDING);
    expect(await occupancyOf(committed)).toHaveLength(1);
  });

  it('skips a booking that was answered after the candidate read and now holds a fresh deadline', async () => {
    const answered = await seed(TENANT_A);
    await occupancyRepo.restartHold(TENANT_A, [answered.lines[0].lineId], FUTURE);

    const result = await job.run(NOW);

    expect(result.expired).toBe(0);
    expect(await statusOf(answered)).toBe(BookingStatus.PENDING);
  });

  it('expires the overdue bookings of every tenant, each only in its own tenant', async () => {
    const a = await seed(TENANT_A);
    const b = await seed(TENANT_B);

    const result = await job.run(NOW);

    expect(result.expired).toBe(2);
    expect(await statusOf(a)).toBe(BookingStatus.CANCELLED);
    expect(await statusOf(b)).toBe(BookingStatus.CANCELLED);
  });

  it("does not touch another tenant's overdue booking when only this tenant is active", async () => {
    const onlyA = new InMemoryBookingPlatformPort();
    onlyA.seed([{ id: TENANT_A, timezone: 'America/Sao_Paulo' }]);
    const scopedJob = new ExpireBookingHoldsJob(
      onlyA,
      bookingRepo,
      occupancyRepo,
      new InMemoryFutureCommitmentExceptionRepository(),
      new InMemoryTenantLock(),
      new InMemoryTransactionManager(),
    );
    const a = await seed(TENANT_A, { holdExpiresAt: FUTURE });
    const b = await seed(TENANT_B);

    const result = await scopedJob.run(NOW);

    expect(result.expired).toBe(0);
    expect(await statusOf(a)).toBe(BookingStatus.PENDING);
    expect(await statusOf(b)).toBe(BookingStatus.PENDING);
  });

  it('keeps going when one booking fails, and counts only the ones it expired', async () => {
    const failing = await seed(TENANT_A);
    const healthy = await seed(TENANT_A);
    const realSave = bookingRepo.save.bind(bookingRepo);
    jest.spyOn(bookingRepo, 'save').mockImplementation((booking) => {
      if (booking.id === failing.id) return Promise.reject(new Error('db down'));
      return realSave(booking);
    });

    const result = await job.run(NOW);

    expect(result.expired).toBe(1);
    expect(publishedBookingIds()).toEqual([healthy.id]);
    expect(await statusOf(healthy)).toBe(BookingStatus.CANCELLED);
  });

  it('treats losing the race to another change as a skip, not a failure, and still expires the rest', async () => {
    const raced = await seed(TENANT_A);
    const healthy = await seed(TENANT_A);
    const realSave = bookingRepo.save.bind(bookingRepo);
    jest.spyOn(bookingRepo, 'save').mockImplementation((booking) => {
      if (booking.id === raced.id) return Promise.reject(new BookingConcurrentModificationError());
      return realSave(booking);
    });

    const result = await job.run(NOW);

    expect(result.expired).toBe(1);
    expect(publishedBookingIds()).toEqual([healthy.id]);
    expect(await statusOf(healthy)).toBe(BookingStatus.CANCELLED);
  });
});
