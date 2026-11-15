import { OUTBOX_PUBLISH_CHUNK_SIZE } from '../../../../shared/utils/publish-to-outbox-in-chunks';
import { BookingBuilder } from '../../../../test/builders/booking';
import { InMemoryOutboxPublisher } from '../../../../test/infrastructure/in-memory-outbox-publisher';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingStatus } from '../../domain/booking.aggregate';
import { TenantUnavailableNoticeDue } from '../../domain/commands/tenant-unavailable-notice-due.command';
import { RaiseTenantUnavailableNoticesUseCase } from './raise-tenant-unavailable-notices.use-case';

const TENANT_A = 'aaaaaaaa-0028-4000-8000-0000000000a1';
const TENANT_B = 'bbbbbbbb-0028-4000-8000-0000000000b1';
const CUSTOMER_1 = 'cccccccc-0001-4000-8000-000000000028';
const CUSTOMER_2 = 'cccccccc-0002-4000-8000-000000000028';
const CUSTOMER_3 = 'cccccccc-0003-4000-8000-000000000028';
const EVENT_ID = 'eeeeeeee-0001-4000-8000-000000000028';
const CORRELATION_ID = 'corr-suspended-28';
const DAY_MS = 24 * 60 * 60 * 1000;

// Relative to now, never a calendar date (docs/ENGINEERING_RULES_TESTING.md).
const SUSPENDED_AT = new Date(Date.now() - 60_000);
const inDays = (days: number): Date => new Date(Date.now() + days * DAY_MS);

describe('RaiseTenantUnavailableNoticesUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let txManager: InMemoryTransactionManager;
  let outbox: InMemoryOutboxPublisher;
  let useCase: RaiseTenantUnavailableNoticesUseCase;

  const run = (overrides: { reason?: string; eventId?: string; tenantId?: string } = {}) =>
    useCase.execute({
      tenantId: overrides.tenantId ?? TENANT_A,
      eventId: overrides.eventId ?? EVENT_ID,
      correlationId: CORRELATION_ID,
      reason: overrides.reason ?? 'OPERATOR',
      suspendedAt: SUSPENDED_AT.toISOString(),
    });

  const seed = (
    customerId: string | null,
    options: { tenantId?: string; status?: BookingStatus; scheduledAt?: Date } = {},
  ): Promise<void> =>
    bookingRepo.save(
      new BookingBuilder()
        .withTenantId(options.tenantId ?? TENANT_A)
        .withCustomerId(customerId)
        .withStatus(options.status ?? BookingStatus.APPROVED)
        .withScheduledAt(options.scheduledAt ?? inDays(3))
        .build(),
    );

  const commands = (): TenantUnavailableNoticeDue[] =>
    outbox.published.filter(
      (e): e is TenantUnavailableNoticeDue => e instanceof TenantUnavailableNoticeDue,
    );

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    txManager = new InMemoryTransactionManager();
    outbox = new InMemoryOutboxPublisher(txManager);
    useCase = new RaiseTenantUnavailableNoticesUseCase(bookingRepo, outbox, txManager);
  });

  it('publishes one command per distinct customer, however many bookings each holds', async () => {
    await seed(CUSTOMER_1);
    await seed(CUSTOMER_1, { scheduledAt: inDays(5) });
    await seed(CUSTOMER_2);

    const result = await run();

    expect(result.noticesPublished).toBe(2);
    expect(commands().map((c) => c.data.customerId)).toEqual([CUSTOMER_1, CUSTOMER_2]);
  });

  it('carries the customer id only, no email and no name', async () => {
    await seed(CUSTOMER_1);

    await run();

    expect(Object.keys(commands()[0].data)).toEqual(['customerId']);
  });

  it('publishes nothing for a tenant with no qualifying booking', async () => {
    const result = await run();

    expect(result.noticesPublished).toBe(0);
    expect(txManager.runCallCount).toBe(0);
  });

  it('skips a guest booking, which has no customer account', async () => {
    await seed(null);
    await seed(CUSTOMER_1);

    await run();

    expect(commands().map((c) => c.data.customerId)).toEqual([CUSTOMER_1]);
  });

  it.each([
    BookingStatus.PENDING,
    BookingStatus.INFO_REQUESTED,
    BookingStatus.COMPLETED,
    BookingStatus.CANCELLED,
    BookingStatus.REJECTED,
    BookingStatus.NO_SHOW,
  ])('does not notify a customer whose only booking is %s', async (status) => {
    await seed(CUSTOMER_1, { status });

    const result = await run();

    expect(result.noticesPublished).toBe(0);
  });

  it('does not notify a customer whose approved booking started before the suspension', async () => {
    await seed(CUSTOMER_1, { scheduledAt: new Date(SUSPENDED_AT.getTime() - DAY_MS) });

    const result = await run();

    expect(result.noticesPublished).toBe(0);
  });

  it('only notifies the suspended tenant: another tenant customer receives nothing', async () => {
    await seed(CUSTOMER_1);
    await seed(CUSTOMER_2, { tenantId: TENANT_B });

    await run();

    expect(commands().map((c) => c.data.customerId)).toEqual([CUSTOMER_1]);
    expect(commands().every((c) => c.tenantId === TENANT_A)).toBe(true);
  });

  it.each(['OPERATOR', 'NON_PAYMENT', 'PAYMENT_REVERSED'])(
    'notifies for the %s reason',
    async (reason) => {
      await seed(CUSTOMER_1);

      const result = await run({ reason });

      expect(result.noticesPublished).toBe(1);
    },
  );

  it.each(['CANCELED', 'SOMETHING_ADDED_LATER'])(
    'publishes nothing for the %s reason',
    async (reason) => {
      await seed(CUSTOMER_1);

      const result = await run({ reason });

      expect(result.noticesPublished).toBe(0);
      expect(outbox.published).toHaveLength(0);
    },
  );

  it('keys each command on the suspension event: the same event gives the same keys', async () => {
    await seed(CUSTOMER_1);
    await seed(CUSTOMER_2);

    await run();
    const firstRun = commands().map((c) => c.dedupKey);
    await run();
    const secondRun = commands()
      .slice(firstRun.length)
      .map((c) => c.dedupKey);

    expect(secondRun).toEqual(firstRun);
    expect(new Set(firstRun).size).toBe(2);
  });

  it('keys a later suspension differently, so it notifies again', async () => {
    await seed(CUSTOMER_1);

    await run({ eventId: EVENT_ID });
    await run({ eventId: 'eeeeeeee-0002-4000-8000-000000000028' });

    const [first, second] = commands();
    expect(first.dedupKey).not.toBe(second.dedupKey);
  });

  it('pages through more customers than one chunk and publishes every one exactly once', async () => {
    const customerCount = OUTBOX_PUBLISH_CHUNK_SIZE + 1;
    for (let i = 0; i < customerCount; i++) {
      await seed(`cccccccc-0001-4000-8000-${String(i).padStart(12, '0')}`);
    }

    const result = await run();

    expect(result.noticesPublished).toBe(customerCount);
    expect(new Set(commands().map((c) => c.data.customerId)).size).toBe(customerCount);
    expect(txManager.runCallCount).toBe(2);
  });

  it('finishes an exact multiple of the chunk size without a trailing empty write', async () => {
    for (let i = 0; i < OUTBOX_PUBLISH_CHUNK_SIZE; i++) {
      await seed(`cccccccc-0002-4000-8000-${String(i).padStart(12, '0')}`);
    }

    const result = await run();

    expect(result.noticesPublished).toBe(OUTBOX_PUBLISH_CHUNK_SIZE);
    expect(txManager.runCallCount).toBe(1);
  });

  it('reads the customers before it opens a transaction', async () => {
    await seed(CUSTOMER_1);
    await seed(CUSTOMER_3);
    const readsInsideTransaction: boolean[] = [];
    const original = bookingRepo.findCustomerIdsWithApprovedBookingsAfter.bind(bookingRepo);
    bookingRepo.findCustomerIdsWithApprovedBookingsAfter = (...args) => {
      readsInsideTransaction.push(txManager.isInTransaction);
      return original(...args);
    };

    await run();

    expect(readsInsideTransaction).toEqual([false]);
  });
});
