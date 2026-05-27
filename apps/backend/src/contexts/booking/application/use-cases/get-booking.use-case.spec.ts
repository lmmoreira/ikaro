import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { GetBookingUseCase } from './get-booking.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000122';
const TENANT_B = '10000000-0000-4000-8000-000000000123';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000122';
const OTHER_CUSTOMER_ID = '20000000-0000-4000-8000-000000000123';
const STAFF_ID = '20000000-0000-4000-8000-000000000124';

describe('GetBookingUseCase', () => {
  let repo: InMemoryBookingRepository;

  beforeEach(() => {
    repo = new InMemoryBookingRepository();
  });

  describe('STAFF/MANAGER role', () => {
    let useCase: GetBookingUseCase;

    beforeEach(() => {
      const ctx = new TenantContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId(STAFF_ID)
        .withActorRole('MANAGER')
        .build();
      useCase = new GetBookingUseCase(repo, ctx);
    });

    it('returns booking detail for any booking in the tenant', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await repo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id });

      expect(result.id).toBe(booking.id);
      expect(result.status).toBe(booking.status);
      expect(result.guestEmail).toBe(booking.guestEmail.address);
      expect(result.guestPhone).toBe(booking.guestPhone.value);
      expect(result.totalPrice.formatted).toMatch(/^R\$/);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].lineId).toBeDefined();
      expect(result.lines[0].serviceNameAtBooking).toBeDefined();
    });

    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({ bookingId: '00000000-0000-4000-8000-000000009999' }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });

    it('tenant isolation: throws BookingNotFoundError for booking from another tenant', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_B).build();
      await repo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toBeInstanceOf(
        BookingNotFoundError,
      );
    });
  });

  describe('CUSTOMER role', () => {
    let useCase: GetBookingUseCase;

    beforeEach(() => {
      const ctx = new TenantContextBuilder()
        .withTenantId(TENANT_A)
        .withActorId(CUSTOMER_ID)
        .withActorType('CUSTOMER')
        .withActorRole('CUSTOMER')
        .build();
      useCase = new GetBookingUseCase(repo, ctx);
    });

    it('returns own booking', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await repo.save(booking);

      const result = await useCase.execute({ bookingId: booking.id });

      expect(result.id).toBe(booking.id);
    });

    it('returns 404 for another customer booking (security: does not reveal existence)', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(OTHER_CUSTOMER_ID)
        .build();
      await repo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id })).rejects.toBeInstanceOf(
        BookingNotFoundError,
      );
    });

    it('throws BookingNotFoundError for non-existent booking', async () => {
      await expect(
        useCase.execute({ bookingId: '00000000-0000-4000-8000-000000009998' }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });
  });
});
