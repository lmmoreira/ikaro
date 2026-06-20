import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { BookingStatus } from '../../domain/booking.aggregate';
import { ListBookingsUseCase } from './list-bookings.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000120';
const TENANT_B = '10000000-0000-4000-8000-000000000121';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000120';
const STAFF_ID = '20000000-0000-4000-8000-000000000121';

const defaultDto = { limit: 25, offset: 0 };

describe('ListBookingsUseCase', () => {
  let repo: InMemoryBookingRepository;

  beforeEach(() => {
    repo = new InMemoryBookingRepository();
  });

  describe('STAFF/MANAGER role', () => {
    let useCase: ListBookingsUseCase;

    beforeEach(() => {
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId(STAFF_ID)
        .withActorRole('MANAGER')
        .build();
      useCase = new ListBookingsUseCase(repo, ctx);
    });

    it('returns all tenant bookings when no filters applied', async () => {
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());

      const result = await useCase.execute(defaultDto);

      expect(result.items).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('filters by status', async () => {
      const approved = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .build();
      await repo.save(approved);
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());

      const result = await useCase.execute({ ...defaultDto, status: BookingStatus.APPROVED });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('APPROVED');
    });

    it('returns paginated slice with correct hasMore', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      }

      const result = await useCase.execute({ limit: 3, offset: 0 });

      expect(result.items).toHaveLength(3);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('second page returns remaining items', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      }

      const result = await useCase.execute({ limit: 3, offset: 3 });

      expect(result.items).toHaveLength(2);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('maps booking fields correctly', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(booking);

      const result = await useCase.execute(defaultDto);

      const item = result.items[0];
      expect(item.id).toBe(booking.id);
      expect(item.status).toBe(booking.status);
      expect(item.type).toBe(booking.type);
      expect(item.totalPrice.formatted).toMatch(/^R\$/);
      expect(item.lineSummary).toHaveLength(booking.lines.length);
      expect(item.lineSummary[0].serviceNameAtBooking).toBeDefined();
    });

    it('does not filter by customerId — sees all bookings', async () => {
      const customerBooking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      const guestBooking = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(customerBooking);
      await repo.save(guestBooking);

      const result = await useCase.execute(defaultDto);

      expect(result.items).toHaveLength(2);
    });

    it('tenant isolation: only returns bookings for own tenant', async () => {
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      await repo.save(new BookingBuilder().withTenantId(TENANT_B).build());

      const result = await useCase.execute(defaultDto);

      expect(result.items).toHaveLength(1);
    });
  });

  describe('CUSTOMER role', () => {
    let useCase: ListBookingsUseCase;

    beforeEach(() => {
      const ctx = new RequestContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId(CUSTOMER_ID)
        .withActorType('CUSTOMER')
        .withActorRole('CUSTOMER')
        .build();
      useCase = new ListBookingsUseCase(repo, ctx);
    });

    it('returns only own bookings', async () => {
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

      const result = await useCase.execute(defaultDto);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(ownBooking.id);
    });

    it('returns empty list when customer has no bookings', async () => {
      const result = await useCase.execute(defaultDto);
      expect(result.items).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });
});
