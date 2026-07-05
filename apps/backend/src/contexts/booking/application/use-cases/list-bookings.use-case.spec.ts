import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { BookingStatus } from '../../domain/booking.aggregate';
import { ListBookingsUseCase } from './list-bookings.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000120';
const TENANT_B = '10000000-0000-4000-8000-000000000121';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000120';

const defaultDto = { limit: 25, offset: 0, cancellationWindowHours: 48 };

describe('ListBookingsUseCase', () => {
  let repo: InMemoryBookingRepository;
  let useCase: ListBookingsUseCase;

  beforeEach(() => {
    repo = new InMemoryBookingRepository();
    useCase = new ListBookingsUseCase(repo);
  });

  describe('STAFF/MANAGER role', () => {
    it('returns all tenant bookings when no filters applied', async () => {
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      expect(result.items).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('filters by a single status', async () => {
      const approved = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .build();
      await repo.save(approved);
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());

      const result = await useCase.execute({
        ...defaultDto,
        status: [BookingStatus.APPROVED],
        tenantId: TENANT_A,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('APPROVED');
    });

    it('filters by multiple statuses', async () => {
      await repo.save(
        new BookingBuilder().withTenantId(TENANT_A).withStatus(BookingStatus.PENDING).build(),
      );
      await repo.save(
        new BookingBuilder()
          .withTenantId(TENANT_A)
          .withStatus(BookingStatus.INFO_REQUESTED)
          .build(),
      );
      await repo.save(
        new BookingBuilder().withTenantId(TENANT_A).withStatus(BookingStatus.APPROVED).build(),
      );

      const result = await useCase.execute({
        ...defaultDto,
        status: [BookingStatus.PENDING, BookingStatus.INFO_REQUESTED],
        tenantId: TENANT_A,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items.map((i) => i.status)).toEqual(
        expect.arrayContaining(['PENDING', 'INFO_REQUESTED']),
      );
    });

    it('returns paginated slice with correct hasMore', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      }

      const result = await useCase.execute({
        ...defaultDto,
        limit: 3,
        offset: 0,
        tenantId: TENANT_A,
      });

      expect(result.items).toHaveLength(3);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('second page returns remaining items', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      }

      const result = await useCase.execute({
        ...defaultDto,
        limit: 3,
        offset: 3,
        tenantId: TENANT_A,
      });

      expect(result.items).toHaveLength(2);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('maps booking fields correctly', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(booking);

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      const item = result.items[0];
      expect(item.id).toBe(booking.id);
      expect(item.status).toBe(booking.status);
      expect(item.type).toBe(booking.type);
      expect(item.totalPrice.amount).toBe(booking.totalPrice.amount.toNumber());
      expect(item.totalPrice.currency).toBe(booking.totalPrice.currency);
      expect(item.lineSummary).toHaveLength(booking.lines.length);
      expect(item.lineSummary[0].lineId).toBe(booking.lines[0].lineId);
      expect(item.lineSummary[0].serviceNameAtBooking).toBeDefined();
      expect(item.lineSummary[0].durationMinsAtBooking).toBe(
        booking.lines[0].durationMinsAtBooking,
      );
    });

    it('sets cancellableUntil to scheduledAt minus the cancellation window on APPROVED bookings', async () => {
      const scheduledAt = new Date('2026-08-10T14:00:00.000Z');
      await repo.save(
        new BookingBuilder()
          .withTenantId(TENANT_A)
          .withStatus(BookingStatus.APPROVED)
          .withScheduledAt(scheduledAt)
          .build(),
      );

      const result = await useCase.execute({
        ...defaultDto,
        cancellationWindowHours: 48,
        tenantId: TENANT_A,
      });

      expect(result.items[0].cancellableUntil).toBe('2026-08-08T14:00:00.000Z');
    });

    it('sets cancellableUntil to null on non-APPROVED bookings', async () => {
      await repo.save(
        new BookingBuilder().withTenantId(TENANT_A).withStatus(BookingStatus.PENDING).build(),
      );

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      expect(result.items[0].cancellableUntil).toBeNull();
    });

    it('does not filter by customerId — sees all bookings', async () => {
      const customerBooking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      const guestBooking = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(customerBooking);
      await repo.save(guestBooking);

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      expect(result.items).toHaveLength(2);
    });

    it('tenant isolation: only returns bookings for own tenant', async () => {
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      await repo.save(new BookingBuilder().withTenantId(TENANT_B).build());

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      expect(result.items).toHaveLength(1);
    });
  });

  describe('CUSTOMER role', () => {
    it('returns only own bookings when customerId is passed', async () => {
      const ownBooking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      const otherBooking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId('20000000-0000-4000-8000-000000000999')
        .build();
      await repo.save(ownBooking);
      await repo.save(otherBooking);

      const result = await useCase.execute({
        ...defaultDto,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(ownBooking.id);
    });

    it('returns empty list when customer has no bookings', async () => {
      const result = await useCase.execute({
        ...defaultDto,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
      });
      expect(result.items).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });
});
