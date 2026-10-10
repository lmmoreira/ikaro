import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryBookingStatusTransitionRepository } from '../../../../test/repositories/booking/in-memory-booking-status-transition.repository';
import { countrySpec } from '@ikaro/i18n';
import { Address } from '../../../../shared/value-objects/address';
import { Money } from '../../../../shared/value-objects/money';
import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingStatusTransition } from '../../domain/booking-status-transition';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { GetBookingByIdUseCase } from './get-booking-by-id.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000122';
const TENANT_B = '10000000-0000-4000-8000-000000000123';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000122';
const STAFF_ID = '20000000-0000-4000-8000-000000000124';

describe('GetBookingByIdUseCase', () => {
  let repo: InMemoryBookingRepository;
  let storageService: InMemoryStorageService;
  let serviceRepo: InMemoryServiceRepository;
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let transitionRepo: InMemoryBookingStatusTransitionRepository;
  let staffPort: InMemoryBookingStaffPort;
  let useCase: GetBookingByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryBookingRepository();
    storageService = new InMemoryStorageService();
    serviceRepo = new InMemoryServiceRepository();
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    transitionRepo = new InMemoryBookingStatusTransitionRepository();
    staffPort = new InMemoryBookingStaffPort();
    useCase = new GetBookingByIdUseCase(
      repo,
      storageService,
      serviceRepo,
      occupancyRepo,
      new InMemoryTransactionManager(),
      transitionRepo,
      staffPort,
    );
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

  describe('status history (M23-S27)', () => {
    const MANAGER_ID = '20000000-0000-4000-8000-000000000125';
    const DEACTIVATED_STAFF_ID = '20000000-0000-4000-8000-000000000126';

    // Distinct, increasing times so the ordering assertion does not depend on the UUIDv7 tiebreak.
    let tick = 0;
    const transition = (
      bookingId: string,
      tenantId: string,
      overrides: Partial<Parameters<typeof BookingStatusTransition.record>[0]>,
    ) => {
      const recorded = BookingStatusTransition.record({
        tenantId,
        bookingId,
        fromStatus: 'APPROVED',
        toStatus: 'NO_SHOW',
        actorType: 'STAFF',
        actorId: STAFF_ID,
        correlationId: '30000000-0000-4000-8000-000000000001',
        ...overrides,
      });
      return BookingStatusTransition.reconstitute({
        id: recorded.id,
        tenantId: recorded.tenantId,
        bookingId: recorded.bookingId,
        fromStatus: recorded.fromStatus,
        toStatus: recorded.toStatus,
        reason: recorded.reason,
        actorType: recorded.actorType,
        actorId: recorded.actorId,
        occurredAt: new Date(Date.UTC(2026, 5, 1, 12, 0, tick++)),
        correlationId: recorded.correlationId,
      });
    };

    it('returns null and never reads the transitions unless the caller asks for the history', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(booking);
      await transitionRepo.saveAll([transition(booking.id, TENANT_A, {})]);
      const findSpy = jest.spyOn(transitionRepo, 'findByBooking');

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
      });

      expect(result.statusHistory).toBeNull();
      expect(findSpy).not.toHaveBeenCalled();
    });

    it('returns the entries oldest first with staff names, the contact name and no name for guest or system', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withContactName('João Silva')
        .build();
      await repo.save(booking);
      staffPort.setName(STAFF_ID, 'Camila Duarte');
      staffPort.setName(MANAGER_ID, 'Rafael Gomes');
      await transitionRepo.saveAll([
        transition(booking.id, TENANT_A, {
          fromStatus: 'PENDING',
          toStatus: 'INFO_REQUESTED',
          reason: 'Envie uma foto',
          actorType: 'STAFF',
          actorId: STAFF_ID,
        }),
        transition(booking.id, TENANT_A, {
          fromStatus: 'INFO_REQUESTED',
          toStatus: 'PENDING',
          actorType: 'CUSTOMER',
          actorId: CUSTOMER_ID,
        }),
        transition(booking.id, TENANT_A, {
          fromStatus: 'PENDING',
          toStatus: 'APPROVED',
          actorType: 'MANAGER',
          actorId: MANAGER_ID,
        }),
        transition(booking.id, TENANT_A, {
          fromStatus: 'APPROVED',
          toStatus: 'CANCELLED',
          actorType: 'GUEST',
          actorId: null,
        }),
        transition(booking.id, TENANT_A, {
          fromStatus: 'CANCELLED',
          toStatus: 'CANCELLED',
          actorType: 'SYSTEM',
          actorId: null,
        }),
      ]);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
        includeStatusHistory: true,
      });

      expect(
        result.statusHistory!.map((e) => [e.toStatus, e.actorType, e.actorId, e.actorName]),
      ).toEqual([
        ['INFO_REQUESTED', 'STAFF', STAFF_ID, 'Camila Duarte'],
        ['PENDING', 'CUSTOMER', CUSTOMER_ID, 'João Silva'],
        ['APPROVED', 'MANAGER', MANAGER_ID, 'Rafael Gomes'],
        ['CANCELLED', 'GUEST', null, null],
        ['CANCELLED', 'SYSTEM', null, null],
      ]);
      expect(result.statusHistory![0]).toMatchObject({
        fromStatus: 'PENDING',
        reason: 'Envie uma foto',
      });
      expect(typeof result.statusHistory![0].occurredAt).toBe('string');
    });

    it('gives a staff actor with no resolvable name a null name', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(booking);
      await transitionRepo.saveAll([
        transition(booking.id, TENANT_A, { actorType: 'MANAGER', actorId: DEACTIVATED_STAFF_ID }),
      ]);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
        includeStatusHistory: true,
      });

      expect(result.statusHistory![0].actorName).toBeNull();
    });

    it("never returns another booking's or another tenant's rows", async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      const other = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(booking);
      await repo.save(other);
      await transitionRepo.saveAll([
        transition(other.id, TENANT_A, {}),
        transition(booking.id, TENANT_B, {}),
      ]);

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
        includeStatusHistory: true,
      });

      expect(result.statusHistory).toEqual([]);
    });

    it('does not reveal a booking, or its history, to a caller from another tenant', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(booking);
      await transitionRepo.saveAll([transition(booking.id, TENANT_A, {})]);

      await expect(
        useCase.execute({
          bookingId: booking.id,
          tenantId: TENANT_B,
          cancellationWindowHours: 48,
          includeStatusHistory: true,
        }),
      ).rejects.toThrow(BookingNotFoundError);
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

  describe('reschedule block (UC-069)', () => {
    const SCHEDULED_AT = new Date('2030-06-20T13:00:00.000Z');
    const TENANT_WINDOW = { minBookingAdvanceHours: 2, maxBookingAdvanceDays: 90 };

    async function approvedBookingWithStaffPick() {
      const service = new ServiceBuilder()
        .withTenantId(TENANT_A)
        .withResourceRequirements([
          ResourceRequirement.create({
            type: ResourceType.STAFF,
            selectionMode: 'CUSTOMER_CHOICE',
          }),
        ])
        .build();
      await serviceRepo.save(service);
      const line = new BookingLineBuilder()
        .withServiceId(service.id)
        .withServiceNameAtBooking(service.name)
        .build();
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(SCHEDULED_AT)
        .withLines([line])
        .build();
      await repo.save(booking);
      occupancyRepo.seed(TENANT_A, line.lineId, {
        resourceId: STAFF_ID,
        resourceType: ResourceType.STAFF,
        resourceName: 'Renata Souza',
        legIndex: null,
        quantityPosition: null,
        selectionMode: 'CUSTOMER_CHOICE',
        isBundleMember: false,
        gapMinutes: null,
        gapSource: null,
        startsAt: SCHEDULED_AT,
        endsAt: new Date(SCHEDULED_AT.getTime() + 3_600_000),
      });
      return { booking, service };
    }

    const customerRead = (bookingId: string) =>
      useCase.execute({
        bookingId,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
        requestingCustomerId: CUSTOMER_ID,
        tenantBookingWindow: TENANT_WINDOW,
      });

    it('returns the kept pick, the pinned availability inputs and the deadline for the owner', async () => {
      const { booking, service } = await approvedBookingWithStaffPick();

      const result = await customerRead(booking.id);

      expect(result.reschedule).toEqual({
        eligibleUntil: new Date(SCHEDULED_AT.getTime() - 48 * 3_600_000).toISOString(),
        serviceIds: [service.id],
        resourceSelections: [
          {
            serviceId: service.id,
            legIndex: null,
            resourceType: ResourceType.STAFF,
            resourceId: STAFF_ID,
          },
        ],
        durationMinutes: null,
        window: { minAdvanceHours: 2, maxAdvanceDays: 90 },
        keptPicks: [
          {
            serviceName: service.name,
            legName: null,
            legIndex: null,
            resourceType: ResourceType.STAFF,
            resourceName: 'Renata Souza',
          },
        ],
      });
    });

    it.each([BookingStatus.PENDING, BookingStatus.INFO_REQUESTED, BookingStatus.CANCELLED])(
      'is null for a %s booking',
      async (status) => {
        const booking = new BookingBuilder()
          .withTenantId(TENANT_A)
          .withCustomerId(CUSTOMER_ID)
          .withStatus(status)
          .build();
        await repo.save(booking);

        expect((await customerRead(booking.id)).reschedule).toBeNull();
      },
    );

    it('is null for a staff read, which never supplies a requesting customer', async () => {
      const { booking } = await approvedBookingWithStaffPick();

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
        tenantBookingWindow: TENANT_WINDOW,
      });

      expect(result.reschedule).toBeNull();
    });

    it('is null when the caller supplies no tenant booking window', async () => {
      const { booking } = await approvedBookingWithStaffPick();

      const result = await useCase.execute({
        bookingId: booking.id,
        tenantId: TENANT_A,
        cancellationWindowHours: 48,
        requestingCustomerId: CUSTOMER_ID,
      });

      expect(result.reschedule).toBeNull();
    });

    it("never reads another tenant's booking", async () => {
      const { booking } = await approvedBookingWithStaffPick();

      await expect(
        useCase.execute({
          bookingId: booking.id,
          tenantId: TENANT_B,
          cancellationWindowHours: 48,
          requestingCustomerId: CUSTOMER_ID,
          tenantBookingWindow: TENANT_WINDOW,
        }),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });
  });
});
