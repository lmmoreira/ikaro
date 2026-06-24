import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { BookingLineBuilder } from '../../../../test/builders/booking/booking-line.builder';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingDiscountDisabledError,
  BookingDiscountExceedsTotalError,
  BookingDiscountMismatchError,
  BookingDiscountNotAvailableError,
  BookingNotFoundError,
  BookingPhotoNotUploadedError,
  CompleteBookingLinesIncompleteError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { CompleteBookingUseCase } from './complete-booking.use-case';
import { Money } from '../../../../shared/value-objects/money';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import type { TenantSettingsProps } from '../../../platform/domain/value-objects/tenant-settings.vo';

const CUSTOMER_ID = '40000000-0000-4000-8000-000000000301';

function settingsWithPointsPerCurrencyUnit(rate: number): TenantSettingsProps {
  const defaults = TenantSettings.default().toJSON();
  return { ...defaults, loyalty: { ...defaults.loyalty, pointsPerCurrencyUnit: rate } };
}

const TENANT_A = '10000000-0000-4000-8000-000000000301';
const TENANT_B = '10000000-0000-4000-8000-000000000302';
const STAFF_ID = '20000000-0000-4000-8000-000000000301';
const LINE_ID_1 = '30000000-0000-4000-8000-000000000301';
const LINE_ID_2 = '30000000-0000-4000-8000-000000000302';

function makeApprovedBooking(
  tenantId = TENANT_A,
  lineIds = [LINE_ID_1],
  customerId: string | null = null,
) {
  const lines = lineIds.map((lineId) =>
    new BookingLineBuilder()
      .withLineId(lineId)
      .withPriceAtBooking(Money.from(100, 'BRL'))
      .withPointsValueAtBooking(10)
      .build(),
  );
  return new BookingBuilder()
    .withTenantId(tenantId)
    .withStatus(BookingStatus.APPROVED)
    .withCustomerId(customerId)
    .withLines(lines)
    .withTotalPrice(Money.from(lineIds.length * 100, 'BRL'))
    .build();
}

function makeDto(
  bookingId: string,
  lineIds = [LINE_ID_1],
  overrides: {
    afterServicePhotoUrls?: string[];
    adminNotes?: string;
    discountByPoints?: { pointsUsed: number; amountDeducted: number };
  } = {},
) {
  return {
    bookingId,
    lines: lineIds.map((lineId) => ({ lineId, actualPriceCharged: 80 })),
    afterServicePhotoUrls: overrides.afterServicePhotoUrls ?? [],
    adminNotes: overrides.adminNotes,
    discountByPoints: overrides.discountByPoints,
  };
}

describe('CompleteBookingUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let storageService: InMemoryStorageService;
  let useCase: CompleteBookingUseCase;

  function makeUseCase(pointsPerCurrencyUnit = 0): CompleteBookingUseCase {
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withActorId(STAFF_ID)
      .withActorRole('MANAGER')
      .withSettings(settingsWithPointsPerCurrencyUnit(pointsPerCurrencyUnit))
      .build();
    return new CompleteBookingUseCase(
      ctx,
      bookingRepo,
      new InMemoryTransactionManager(),
      eventBus,
      new PhotoExistenceService(storageService),
    );
  }

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    eventBus = new InMemoryEventBus();
    storageService = new InMemoryStorageService();
    useCase = makeUseCase();
  });

  it('transitions APPROVED → COMPLETED and returns result', async () => {
    const booking = makeApprovedBooking();
    await bookingRepo.save(booking);

    const result = await useCase.execute(makeDto(booking.id));

    expect(result.status).toBe(BookingStatus.COMPLETED);
    expect(result.bookingId).toBe(booking.id);
    expect(result.completedAt).toBeDefined();
    expect(result.totalActualPrice.amount).toBe(80);
    expect(result.totalActualPrice.currency).toBe('BRL');
  });

  it('persists actualPriceCharged per line and completedBy', async () => {
    const booking = makeApprovedBooking();
    await bookingRepo.save(booking);

    await useCase.execute(makeDto(booking.id));

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.status).toBe(BookingStatus.COMPLETED);
    expect(saved!.completedBy).toBe(STAFF_ID);
    expect(saved!.completedAt).not.toBeNull();
    expect(saved!.lines[0].actualPriceCharged!.amount.toNumber()).toBe(80);
  });

  it('persists adminNotes when provided', async () => {
    const booking = makeApprovedBooking();
    await bookingRepo.save(booking);

    await useCase.execute(makeDto(booking.id, [LINE_ID_1], { adminNotes: 'Extra shine applied' }));

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.adminNotes).toBe('Extra shine applied');
  });

  it('persists afterServicePhotoUrls', async () => {
    const booking = makeApprovedBooking();
    await bookingRepo.save(booking);
    const photos = [`tenants/${TENANT_A}/bookings/${booking.id}/after1.jpg`];
    photos.forEach((path) => storageService.markAsUploaded(path));

    await useCase.execute(makeDto(booking.id, [LINE_ID_1], { afterServicePhotoUrls: photos }));

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.afterServicePhotoUrls).toEqual(photos);
  });

  it('throws BookingPhotoNotUploadedError when a photo path does not exist in storage', async () => {
    const booking = makeApprovedBooking();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute(
        makeDto(booking.id, [LINE_ID_1], {
          afterServicePhotoUrls: [`tenants/${TENANT_A}/bookings/${booking.id}/missing.jpg`],
        }),
      ),
    ).rejects.toBeInstanceOf(BookingPhotoNotUploadedError);
  });

  it('publishes BookingCompleted event with full line payload', async () => {
    const booking = makeApprovedBooking();
    await bookingRepo.save(booking);

    await useCase.execute(makeDto(booking.id));

    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('BookingCompleted');
    const data = eventBus.published[0].data as {
      lines: {
        lineId: string;
        actualPriceCharged: { amount: string };
        pointsValueAtBooking: number;
      }[];
    };
    expect(data.lines[0].lineId).toBe(LINE_ID_1);
    expect(data.lines[0].actualPriceCharged.amount).toBe('80.00');
    expect(data.lines[0].pointsValueAtBooking).toBe(10);
  });

  it('uses priceAtBooking as default for lines not in the request when all lines present', async () => {
    const booking = makeApprovedBooking(TENANT_A, [LINE_ID_1, LINE_ID_2]);
    await bookingRepo.save(booking);

    const result = await useCase.execute({
      bookingId: booking.id,
      lines: [
        { lineId: LINE_ID_1, actualPriceCharged: 50 },
        { lineId: LINE_ID_2, actualPriceCharged: 100 },
      ],
      afterServicePhotoUrls: [],
    });

    expect(result.totalActualPrice.amount).toBe(150);
  });

  it('throws CompleteBookingLinesIncompleteError when a booking line is missing from request', async () => {
    const booking = makeApprovedBooking(TENANT_A, [LINE_ID_1, LINE_ID_2]);
    await bookingRepo.save(booking);

    await expect(useCase.execute(makeDto(booking.id, [LINE_ID_1]))).rejects.toThrow(
      CompleteBookingLinesIncompleteError,
    );
  });

  it('throws InvalidBookingTransitionError when booking is PENDING', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withStatus(BookingStatus.PENDING)
      .withLines([new BookingLineBuilder().withLineId(LINE_ID_1).build()])
      .build();
    await bookingRepo.save(booking);

    await expect(useCase.execute(makeDto(booking.id))).rejects.toThrow(
      InvalidBookingTransitionError,
    );
  });

  it('throws InvalidBookingTransitionError when booking is CANCELLED', async () => {
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withStatus(BookingStatus.CANCELLED)
      .withLines([new BookingLineBuilder().withLineId(LINE_ID_1).build()])
      .build();
    await bookingRepo.save(booking);

    await expect(useCase.execute(makeDto(booking.id))).rejects.toThrow(
      InvalidBookingTransitionError,
    );
  });

  it('throws BookingNotFoundError when booking does not exist', async () => {
    await expect(useCase.execute(makeDto('00000000-0000-4000-8000-000000000000'))).rejects.toThrow(
      BookingNotFoundError,
    );
  });

  it('tenant isolation: cannot complete booking from another tenant', async () => {
    const booking = makeApprovedBooking(TENANT_B);
    await bookingRepo.save(booking);

    await expect(useCase.execute(makeDto(booking.id))).rejects.toThrow(BookingNotFoundError);
  });

  describe('discountByPoints', () => {
    it('applies the discount and persists it on the booking when valid', async () => {
      const booking = makeApprovedBooking(TENANT_A, [LINE_ID_1], CUSTOMER_ID);
      await bookingRepo.save(booking);
      const discountUseCase = makeUseCase(10);

      const result = await discountUseCase.execute(
        makeDto(booking.id, [LINE_ID_1], {
          discountByPoints: { pointsUsed: 200, amountDeducted: 20 },
        }),
      );

      expect(result.totalActualPrice.amount).toBe(60);
      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.discountPointsUsed).toBe(200);
      expect(saved!.discountAmount?.amount.toFixed(2)).toBe('20.00');
    });

    it('throws BookingDiscountNotAvailableError for a guest booking (no customerId)', async () => {
      const booking = makeApprovedBooking(TENANT_A, [LINE_ID_1], null);
      await bookingRepo.save(booking);
      const discountUseCase = makeUseCase(10);

      await expect(
        discountUseCase.execute(
          makeDto(booking.id, [LINE_ID_1], {
            discountByPoints: { pointsUsed: 200, amountDeducted: 20 },
          }),
        ),
      ).rejects.toThrow(BookingDiscountNotAvailableError);
    });

    it('throws BookingDiscountDisabledError when pointsPerCurrencyUnit is 0', async () => {
      const booking = makeApprovedBooking(TENANT_A, [LINE_ID_1], CUSTOMER_ID);
      await bookingRepo.save(booking);

      await expect(
        useCase.execute(
          makeDto(booking.id, [LINE_ID_1], {
            discountByPoints: { pointsUsed: 200, amountDeducted: 20 },
          }),
        ),
      ).rejects.toThrow(BookingDiscountDisabledError);
    });

    it('throws BookingDiscountMismatchError when amountDeducted does not reconcile', async () => {
      const booking = makeApprovedBooking(TENANT_A, [LINE_ID_1], CUSTOMER_ID);
      await bookingRepo.save(booking);
      const discountUseCase = makeUseCase(10);

      await expect(
        discountUseCase.execute(
          makeDto(booking.id, [LINE_ID_1], {
            discountByPoints: { pointsUsed: 200, amountDeducted: 25 },
          }),
        ),
      ).rejects.toThrow(BookingDiscountMismatchError);
    });

    it('throws BookingDiscountMismatchError for a sub-cent amountDeducted that would round up to a different value', async () => {
      const booking = makeApprovedBooking(TENANT_A, [LINE_ID_1], CUSTOMER_ID);
      await bookingRepo.save(booking);
      const discountUseCase = makeUseCase(10);

      // 200 pts / 10 = 20 exactly; 20.009 rounds to 20.01, which must not slip through.
      await expect(
        discountUseCase.execute(
          makeDto(booking.id, [LINE_ID_1], {
            discountByPoints: { pointsUsed: 200, amountDeducted: 20.009 },
          }),
        ),
      ).rejects.toThrow(BookingDiscountMismatchError);
    });

    it('throws BookingDiscountExceedsTotalError when amountDeducted exceeds the lines total', async () => {
      const booking = makeApprovedBooking(TENANT_A, [LINE_ID_1], CUSTOMER_ID);
      await bookingRepo.save(booking);
      const discountUseCase = makeUseCase(1);

      await expect(
        discountUseCase.execute(
          makeDto(booking.id, [LINE_ID_1], {
            discountByPoints: { pointsUsed: 90, amountDeducted: 90 },
          }),
        ),
      ).rejects.toThrow(BookingDiscountExceedsTotalError);
    });
  });
});
