import { countrySpec } from '@ikaro/i18n';
import { Address } from '../../../../shared/value-objects/address';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
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
        locale: 'pt-BR',
      });

      expect(result.id).toBe(booking.id);
      expect(result.status).toBe(booking.status);
      expect(result.contactEmail).toBe(booking.contactEmail.address);
      expect(result.contactPhone).toBe(booking.contactPhone.value);
      expect(result.totalPrice.formatted).toMatch(/^R\$/);
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
        locale: 'pt-BR',
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
        locale: 'pt-BR',
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
        locale: 'pt-BR',
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
        locale: 'pt-BR',
      });

      expect(result.beforeServicePhotoUrls).toEqual([
        `http://fake-gcs/bucket/${beforePath}?sig=test&op=read`,
      ]);
      expect(result.afterServicePhotoUrls).toEqual([
        `http://fake-gcs/bucket/${afterPath}?sig=test&op=read`,
      ]);
      expect(storageService.readSignedPaths).toEqual([beforePath, afterPath]);
    });

    it('throws BookingNotFoundError when booking does not exist', async () => {
      await expect(
        useCase.execute({
          bookingId: '00000000-0000-4000-8000-000000009999',
          tenantId: TENANT_A,
          locale: 'pt-BR',
        }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });

    it('tenant isolation: throws BookingNotFoundError for booking from another tenant', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_B).build();
      await repo.save(booking);

      await expect(
        useCase.execute({ bookingId: booking.id, tenantId: TENANT_A, locale: 'pt-BR' }),
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
        locale: 'pt-BR',
      });

      expect(result.id).toBe(booking.id);
    });

    it('throws BookingNotFoundError for non-existent booking', async () => {
      await expect(
        useCase.execute({
          bookingId: '00000000-0000-4000-8000-000000009998',
          tenantId: TENANT_A,
          locale: 'pt-BR',
        }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });
  });
});
