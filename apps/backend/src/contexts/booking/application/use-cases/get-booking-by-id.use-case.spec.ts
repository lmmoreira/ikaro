import { countrySpec } from '@ikaro/i18n';
import { Address } from '../../../../shared/value-objects/address';
import { Money } from '../../../../shared/value-objects/money';
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { GetBookingByIdUseCase } from './get-booking-by-id.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000122';
const TENANT_B = '10000000-0000-4000-8000-000000000123';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000122';
const STAFF_ID = '20000000-0000-4000-8000-000000000124';

describe('GetBookingByIdUseCase', () => {
  let repo: InMemoryBookingRepository;
  let storageService: InMemoryStorageService;
  let useCase: GetBookingByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryBookingRepository();
    storageService = new InMemoryStorageService();
    useCase = new GetBookingByIdUseCase(repo, storageService);
  });

  describe('STAFF/MANAGER role', () => {
    it('returns booking detail for any booking in the tenant', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.id).toBe(booking.id);
      expect(result.status).toBe(booking.status);
      expect(result.contactEmail).toBe(booking.contactEmail.address);
      expect(result.contactPhone).toBe(booking.contactPhone.value);
      expect(result.totalPrice.amount).toBe(booking.totalPrice.amount.toNumber());
      expect(result.totalPrice.currency).toBe(booking.totalPrice.currency);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].lineId).toBeDefined();
      expect(result.lines[0].serviceNameAtBooking).toBeDefined();
    });

    it('returns contactAddress, approvedAt, approvedBy and rejectionReason', async () => {
      const address = Address.create(
        {
          street: 'Rua das Flores',
          number: '100',
          neighborhood: 'Centro',
          city: 'Belo Horizonte',
          state: 'MG',
          zipCode: '30100-000',
        },
        countrySpec('BR').address,
      );
      const approvedAt = new Date('2026-05-01T10:00:00.000Z');
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withContactAddress(address)
        .withApprovedAt(approvedAt)
        .withApprovedBy(STAFF_ID)
        .withRejectionReason('Cliente não confirmou disponibilidade')
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.contactAddress).toEqual({
        street: 'Rua das Flores',
        number: '100',
        complement: null,
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        zipCode: '30100-000',
      });
      expect(result.approvedAt).toBe(approvedAt.toISOString());
      expect(result.approvedBy).toBe(STAFF_ID);
      expect(result.rejectionReason).toBe('Cliente não confirmou disponibilidade');
    });

    it('returns null for contactAddress, approvedAt, approvedBy and rejectionReason when unset', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.contactAddress).toBeNull();
      expect(result.approvedAt).toBeNull();
      expect(result.approvedBy).toBeNull();
      expect(result.rejectionReason).toBeNull();
    });

    it('returns notes when set on the booking', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withNotes('Carro está na garagem do prédio')
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.notes).toBe('Carro está na garagem do prédio');
    });

    it('returns signed read URLs for before/after-service photos', async () => {
      const beforePath = `tenants/${TENANT_A}/bookings/photo-before.jpg`;
      const afterPath = `tenants/${TENANT_A}/bookings/photo-after.jpg`;
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withBeforeServicePhotoUrls([beforePath])
        .withAfterServicePhotoUrls([afterPath])
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.beforeServicePhotoUrls).toEqual([
        `http://fake-gcs/bucket/${beforePath}?sig=test&op=read`,
      ]);
      expect(result.afterServicePhotoUrls).toEqual([
        `http://fake-gcs/bucket/${afterPath}?sig=test&op=read`,
      ]);
      expect(storageService.readSignedPaths).toEqual([beforePath, afterPath]);
      // Raw storage paths (not signed URLs) — needed by feature-booking-photo, which validates
      // against the raw tenants/<id>/bookings/<id>/... shape.
      expect(result.beforeServicePhotoPaths).toEqual([beforePath]);
      expect(result.afterServicePhotoPaths).toEqual([afterPath]);
    });

    it('returns totalActualPrice, discount and completedAt for a completed booking', async () => {
      const completedAt = new Date('2026-06-01T15:00:00.000Z');
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.COMPLETED)
        .withTotalActualPrice(Money.from(76, 'BRL'))
        .withDiscountPointsUsed(240)
        .withDiscountAmount(Money.from(24, 'BRL'))
        .withCompletedAt(completedAt)
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.totalActualPrice).toEqual({
        amount: 76,
        currency: 'BRL',
      });
      expect(result.discountPointsUsed).toBe(240);
      expect(result.discountAmount).toEqual({
        amount: 24,
        currency: 'BRL',
      });
      expect(result.completedAt).toBe(completedAt.toISOString());
    });

    it('sets pointsEarned to the sum of the lines pointsValueAtBooking for a completed booking', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.COMPLETED)
        .withLines([
          new BookingLineBuilder().withPointsValueAtBooking(10).build(),
          new BookingLineBuilder().withPointsValueAtBooking(5).build(),
        ])
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.pointsEarned).toBe(15);
    });

    it('returns null totalActualPrice, discount and completedAt when booking is not completed', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.totalActualPrice).toBeNull();
      expect(result.discountPointsUsed).toBeNull();
      expect(result.discountAmount).toBeNull();
      expect(result.completedAt).toBeNull();
      expect(result.pointsEarned).toBeNull();
    });

    it('sets cancellableUntil to scheduledAt minus the cancellation window for APPROVED bookings', async () => {
      const scheduledAt = new Date('2026-08-10T14:00:00.000Z');
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(scheduledAt)
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.cancellableUntil).toBe('2026-08-08T14:00:00.000Z');
    });

    it('sets cancellableUntil to null for non-APPROVED bookings', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.PENDING)
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.cancellableUntil).toBeNull();
    });

    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({
          bookingId: '00000000-0000-4000-8000-000000009999',
          tenantId: TENANT_A,
          cancellationWindowHours: 48,
        }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });

    it('tenant isolation: throws BookingNotFoundError for booking from another tenant', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_B).build();
      await repo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          tenantId: TENANT_A,
          cancellationWindowHours: 48,
        }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });
  });

  describe('CUSTOMER role', () => {
    it('returns own booking', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await repo.save(booking);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
        requestingCustomerId: CUSTOMER_ID,
      });

      expect(result.id).toBe(booking.id);
    });

    it('throws BookingNotFoundError for non-existent booking', async () => {
      await expect(
        useCase.execute({
          bookingId: '00000000-0000-4000-8000-000000009998',
          tenantId: TENANT_A,
          cancellationWindowHours: 48,
          requestingCustomerId: CUSTOMER_ID,
        }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });

    it("throws BookingNotFoundError for another customer's booking", async () => {
      const otherCustomerId = '20000000-0000-4000-8000-000000000199';
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(otherCustomerId)
        .build();
      await repo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          tenantId: TENANT_A,
          cancellationWindowHours: 48,
          requestingCustomerId: CUSTOMER_ID,
        }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });

    it('throws BookingNotFoundError when requestingCustomerId is an empty string mismatch', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      await repo.save(booking);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          tenantId: TENANT_A,
          cancellationWindowHours: 48,
          requestingCustomerId: '',
        }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });
  });
});
