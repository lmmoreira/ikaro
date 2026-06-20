import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryTenantLocalizationPort } from '../../../../test/infrastructure/in-memory-tenant-localization.port';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { BookingLineBuilder } from '../../../../test/builders/booking/booking-line.builder';
import { TenantContextBuilder } from '../../../../test/factories/tenant-context.factory';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingNotFoundError,
  BookingPhotoNotUploadedError,
  CompleteBookingLinesIncompleteError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { PhotoExistenceService } from '../services/photo-existence.service';
import { CompleteBookingUseCase } from './complete-booking.use-case';
import { Money } from '../../../../shared/value-objects/money';

const TENANT_A = '10000000-0000-4000-8000-000000000301';
const TENANT_B = '10000000-0000-4000-8000-000000000302';
const STAFF_ID = '20000000-0000-4000-8000-000000000301';
const LINE_ID_1 = '30000000-0000-4000-8000-000000000301';
const LINE_ID_2 = '30000000-0000-4000-8000-000000000302';

function makeApprovedBooking(tenantId = TENANT_A, lineIds = [LINE_ID_1]) {
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
    .withLines(lines)
    .withTotalPrice(Money.from(lineIds.length * 100, 'BRL'))
    .build();
}

function makeDto(
  bookingId: string,
  lineIds = [LINE_ID_1],
  overrides: { afterServicePhotoUrls?: string[]; adminNotes?: string } = {},
) {
  return {
    bookingId,
    lines: lineIds.map((lineId) => ({ lineId, actualPriceCharged: 80 })),
    afterServicePhotoUrls: overrides.afterServicePhotoUrls ?? [],
    adminNotes: overrides.adminNotes,
  };
}

describe('CompleteBookingUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let eventBus: InMemoryEventBus;
  let storageService: InMemoryStorageService;
  let useCase: CompleteBookingUseCase;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    eventBus = new InMemoryEventBus();
    storageService = new InMemoryStorageService();
    const ctx = new TenantContextBuilder()
      .withTenantId(TENANT_A)
      .withActorId(STAFF_ID)
      .withActorRole('MANAGER')
      .build();
    useCase = new CompleteBookingUseCase(
      ctx,
      bookingRepo,
      new InMemoryTransactionManager(),
      eventBus,
      new InMemoryTenantLocalizationPort(),
      new PhotoExistenceService(storageService),
    );
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
});
