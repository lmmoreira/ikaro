import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
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

const CUSTOMER_ID = '40000000-0000-4000-8000-000000000301';

const TENANT_A = '10000000-0000-4000-8000-000000000301';
const TENANT_B = '10000000-0000-4000-8000-000000000302';
const STAFF_ID = '20000000-0000-4000-8000-000000000301';
const CORRELATION_ID = 'corr-complete-test';
const LINE_ID_1 = '30000000-0000-4000-8000-000000000301';
const LINE_ID_2 = '30000000-0000-4000-8000-000000000302';

const baseCtx = {
  tenantId: TENANT_A,
  staffId: STAFF_ID,
  correlationId: CORRELATION_ID,
  currency: 'BRL',
  pointsPerCurrencyUnit: 0,
};

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

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    storageService = new InMemoryStorageService();
    useCase = new CompleteBookingUseCase(
      bookingRepo,
      new InMemoryTransactionManager(),
      new PhotoExistenceService(storageService),
    );
  });

  it('transitions APPROVED → COMPLETED and returns result', async () => {
    const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1]).build();
    await bookingRepo.save(booking);

    const result = await useCase.execute({ ...makeDto(booking.id), ...baseCtx });

    expect(result.status).toBe(BookingStatus.COMPLETED);
    expect(result.bookingId).toBe(booking.id);
    expect(result.completedAt).toBeDefined();
    expect(result.totalActualPrice.amount).toBe(80);
    expect(result.totalActualPrice.currency).toBe('BRL');
  });

  it('persists actualPriceCharged per line and completedBy', async () => {
    const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1]).build();
    await bookingRepo.save(booking);

    await useCase.execute({ ...makeDto(booking.id), ...baseCtx });

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.status).toBe(BookingStatus.COMPLETED);
    expect(saved!.completedBy).toBe(STAFF_ID);
    expect(saved!.completedAt).not.toBeNull();
    expect(saved!.lines[0].actualPriceCharged!.amount.toNumber()).toBe(80);
  });

  it('persists adminNotes when provided', async () => {
    const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1]).build();
    await bookingRepo.save(booking);

    await useCase.execute({
      ...makeDto(booking.id, [LINE_ID_1], { adminNotes: 'Extra shine applied' }),
      ...baseCtx,
    });

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.adminNotes).toBe('Extra shine applied');
  });

  it('promotes afterServicePhotoUrls from tmp/ to the permanent booking path', async () => {
    const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1]).build();
    await bookingRepo.save(booking);
    const tmpPath = `tmp/${TENANT_A}/upload-1/after1.jpg`;
    storageService.markAsUploaded(tmpPath);

    await useCase.execute({
      ...makeDto(booking.id, [LINE_ID_1], { afterServicePhotoUrls: [tmpPath] }),
      ...baseCtx,
    });

    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.afterServicePhotoUrls).toEqual([
      `tenants/${TENANT_A}/bookings/${booking.id}/upload-1/after1.jpg`,
    ]);
    expect(storageService.deletedPaths).toEqual([tmpPath]);
  });

  it('completes the booking even when promotion (copy/delete) fails after the save has already succeeded', async () => {
    const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1]).build();
    await bookingRepo.save(booking);
    const tmpPath = `tmp/${TENANT_A}/upload-1/after1.jpg`;
    storageService.markAsUploaded(tmpPath);
    jest.spyOn(storageService, 'copy').mockRejectedValue(new Error('storage unavailable'));

    const result = await useCase.execute({
      ...makeDto(booking.id, [LINE_ID_1], { afterServicePhotoUrls: [tmpPath] }),
      ...baseCtx,
    });

    // PhotoExistenceService.executePhotoPromotion() is best-effort — a storage failure after the
    // booking row is already saved must not surface as a use-case error or block completion.
    expect(result.status).toBe(BookingStatus.COMPLETED);
    const saved = await bookingRepo.findById(booking.id, TENANT_A);
    expect(saved!.status).toBe(BookingStatus.COMPLETED);
    expect(saved!.afterServicePhotoUrls).toEqual([
      `tenants/${TENANT_A}/bookings/${booking.id}/upload-1/after1.jpg`,
    ]);
  });

  it('throws BookingPhotoNotUploadedError when a photo path does not exist in storage', async () => {
    const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1]).build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        ...makeDto(booking.id, [LINE_ID_1], {
          afterServicePhotoUrls: [`tmp/${TENANT_A}/upload-1/missing.jpg`],
        }),
        ...baseCtx,
      }),
    ).rejects.toBeInstanceOf(BookingPhotoNotUploadedError);
  });

  it('publishes BookingCompleted event with full line payload', async () => {
    const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1]).build();
    await bookingRepo.save(booking);

    await useCase.execute({ ...makeDto(booking.id), ...baseCtx });

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
    const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1, LINE_ID_2]).build();
    await bookingRepo.save(booking);

    const result = await useCase.execute({
      bookingId: booking.id,
      lines: [
        { lineId: LINE_ID_1, actualPriceCharged: 50 },
        { lineId: LINE_ID_2, actualPriceCharged: 100 },
      ],
      afterServicePhotoUrls: [],
      ...baseCtx,
    });

    expect(result.totalActualPrice.amount).toBe(150);
  });

  it('throws CompleteBookingLinesIncompleteError when a booking line is missing from request', async () => {
    const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1, LINE_ID_2]).build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({ ...makeDto(booking.id, [LINE_ID_1]), ...baseCtx }),
    ).rejects.toThrow(CompleteBookingLinesIncompleteError);
  });

  it('throws InvalidBookingTransitionError when booking is PENDING', async () => {
    const booking = BookingBuilder.forStatus(TENANT_A, BookingStatus.PENDING, [LINE_ID_1]).build();
    await bookingRepo.save(booking);

    await expect(useCase.execute({ ...makeDto(booking.id), ...baseCtx })).rejects.toThrow(
      InvalidBookingTransitionError,
    );
  });

  it('throws InvalidBookingTransitionError when booking is CANCELLED', async () => {
    const booking = BookingBuilder.forStatus(TENANT_A, BookingStatus.CANCELLED, [
      LINE_ID_1,
    ]).build();
    await bookingRepo.save(booking);

    await expect(useCase.execute({ ...makeDto(booking.id), ...baseCtx })).rejects.toThrow(
      InvalidBookingTransitionError,
    );
  });

  it('throws BookingNotFoundError when booking does not exist', async () => {
    await expect(
      useCase.execute({ ...makeDto('00000000-0000-4000-8000-000000000000'), ...baseCtx }),
    ).rejects.toThrow(BookingNotFoundError);
  });

  it('tenant isolation: cannot complete booking from another tenant', async () => {
    const booking = BookingBuilder.approved(TENANT_B, [LINE_ID_1]).build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({ ...makeDto(booking.id), ...baseCtx, tenantId: TENANT_A }),
    ).rejects.toThrow(BookingNotFoundError);
  });

  describe('discountByPoints', () => {
    it('applies the discount and persists it on the booking when valid', async () => {
      const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1], CUSTOMER_ID).build();
      await bookingRepo.save(booking);

      const result = await useCase.execute({
        ...makeDto(booking.id, [LINE_ID_1], {
          discountByPoints: { pointsUsed: 200, amountDeducted: 20 },
        }),
        ...baseCtx,
        pointsPerCurrencyUnit: 10,
      });

      expect(result.totalActualPrice.amount).toBe(60);
      const saved = await bookingRepo.findById(booking.id, TENANT_A);
      expect(saved!.discountPointsUsed).toBe(200);
      expect(saved!.discountAmount?.amount.toFixed(2)).toBe('20.00');
    });

    it('throws BookingDiscountNotAvailableError for a guest booking (no customerId)', async () => {
      const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1], null).build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          ...makeDto(booking.id, [LINE_ID_1], {
            discountByPoints: { pointsUsed: 200, amountDeducted: 20 },
          }),
          ...baseCtx,
          pointsPerCurrencyUnit: 10,
        }),
      ).rejects.toThrow(BookingDiscountNotAvailableError);
    });

    it('throws BookingDiscountDisabledError when pointsPerCurrencyUnit is 0', async () => {
      const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1], CUSTOMER_ID).build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          ...makeDto(booking.id, [LINE_ID_1], {
            discountByPoints: { pointsUsed: 200, amountDeducted: 20 },
          }),
          ...baseCtx,
          pointsPerCurrencyUnit: 0,
        }),
      ).rejects.toThrow(BookingDiscountDisabledError);
    });

    it('throws BookingDiscountMismatchError when amountDeducted does not reconcile', async () => {
      const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1], CUSTOMER_ID).build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          ...makeDto(booking.id, [LINE_ID_1], {
            discountByPoints: { pointsUsed: 200, amountDeducted: 25 },
          }),
          ...baseCtx,
          pointsPerCurrencyUnit: 10,
        }),
      ).rejects.toThrow(BookingDiscountMismatchError);
    });

    it('throws BookingDiscountMismatchError for a sub-cent amountDeducted that would round up to a different value', async () => {
      const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1], CUSTOMER_ID).build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          ...makeDto(booking.id, [LINE_ID_1], {
            discountByPoints: { pointsUsed: 200, amountDeducted: 20.009 },
          }),
          ...baseCtx,
          pointsPerCurrencyUnit: 10,
        }),
      ).rejects.toThrow(BookingDiscountMismatchError);
    });

    it('throws BookingDiscountExceedsTotalError when amountDeducted exceeds the lines total', async () => {
      const booking = BookingBuilder.approved(TENANT_A, [LINE_ID_1], CUSTOMER_ID).build();
      await bookingRepo.save(booking);

      await expect(
        useCase.execute({
          ...makeDto(booking.id, [LINE_ID_1], {
            discountByPoints: { pointsUsed: 90, amountDeducted: 90 },
          }),
          ...baseCtx,
          pointsPerCurrencyUnit: 1,
        }),
      ).rejects.toThrow(BookingDiscountExceedsTotalError);
    });
  });
});
