import { HttpException, HttpStatus } from '@nestjs/common';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { InMemoryStorageService } from '../../../../test/infrastructure/in-memory-storage.service';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { BookingCompletionController } from './booking-completion.controller';
import { CancelBookingAsCustomerUseCase } from '../../application/use-cases/cancel-booking-as-customer.use-case';
import { CancelBookingAsAdminUseCase } from '../../application/use-cases/cancel-booking-as-admin.use-case';
import { RescheduleBookingUseCase } from '../../application/use-cases/reschedule-booking.use-case';
import { CompleteBookingUseCase } from '../../application/use-cases/complete-booking.use-case';
import { BookingSlotConflictService } from '../../application/services/booking-slot-conflict.service';
import { PhotoExistenceService } from '../../application/services/photo-existence.service';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingLineBuilder } from '../../../../test/builders/booking/booking-line.builder';
import { Money } from '../../../../shared/value-objects/money';

const TENANT_A = '10000000-0000-4000-8000-000000000110';
const TENANT_B = '10000000-0000-4000-8000-000000000111';
const STAFF_ID = '20000000-0000-4000-8000-000000000112';
const CORRELATION_ID = 'corr-booking-ctrl-test';

describe('BookingCompletionController', () => {
  let controller: BookingCompletionController;
  let bookingRepo: InMemoryBookingRepository;
  let storageService: InMemoryStorageService;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    storageService = new InMemoryStorageService();
    const staffCtx = new RequestContextBuilder()
      .withTenantId(TENANT_A)
      .withCorrelationId(CORRELATION_ID)
      .withActorId(STAFF_ID)
      .withActorRole('MANAGER')
      .build();

    controller = new BookingCompletionController(
      staffCtx,
      new CancelBookingAsCustomerUseCase(bookingRepo, new InMemoryTransactionManager()),
      new CancelBookingAsAdminUseCase(bookingRepo, new InMemoryTransactionManager()),
      new RescheduleBookingUseCase(
        bookingRepo,
        new BookingSlotConflictService(new InMemoryBookingAvailabilityPort()),
        new InMemoryTransactionManager(),
      ),
      new CompleteBookingUseCase(
        bookingRepo,
        new InMemoryTransactionManager(),
        new PhotoExistenceService(storageService),
      ),
    );
  });

  describe('cancelAsAdmin()', () => {
    it('cancels a PENDING booking and returns CANCELLED status', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      const result = await controller.cancelAsAdmin(booking.id, {});
      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(result.bookingId).toBe(booking.id);
    });

    it('cancels an APPROVED booking scheduled in 1 hour (no window constraint)', async () => {
      const nearFuture = new Date(Date.now() + 60 * 60_000);
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(nearFuture)
        .build();
      await bookingRepo.save(booking);

      const result = await controller.cancelAsAdmin(booking.id, {});
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('passes optional reason to the use case', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await bookingRepo.save(booking);

      const result = await controller.cancelAsAdmin(booking.id, { reason: 'Staff unavailable' });
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .cancelAsAdmin('00000000-0000-4000-8000-000000009999', {})
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps InvalidBookingTransitionError to 422 when booking is COMPLETED', async () => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.COMPLETED)
        .build();
      await bookingRepo.save(booking);

      const err = await controller.cancelAsAdmin(booking.id, {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('tenant isolation: cannot cancel a booking from tenantB (returns 404)', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_B).build();
      await bookingRepo.save(booking);

      const err = await controller.cancelAsAdmin(booking.id, {}).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });
  });

  describe('complete()', () => {
    const LINE_ID = '30000000-0000-4000-8000-000000000110';

    function approvedBookingWithLine() {
      const line = new BookingLineBuilder()
        .withLineId(LINE_ID)
        .withPriceAtBooking(Money.from(100, 'BRL'))
        .build();
      return new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .withLines([line])
        .withTotalPrice(Money.from(100, 'BRL'))
        .build();
    }

    it('completes an APPROVED booking and returns 200 shape', async () => {
      const booking = approvedBookingWithLine();
      await bookingRepo.save(booking);

      const result = await controller.complete(booking.id, {
        lines: [{ lineId: LINE_ID, actualPriceCharged: 80 }],
        afterServicePhotoUrls: [],
      });

      expect(result.status).toBe(BookingStatus.COMPLETED);
      expect(result.bookingId).toBe(booking.id);
      expect(result.completedAt).toBeDefined();
      expect(result.totalActualPrice.amount).toBe(80);
    });

    it('maps BookingNotFoundError to 404', async () => {
      const err = await controller
        .complete('00000000-0000-4000-8000-000000009999', {
          lines: [{ lineId: LINE_ID, actualPriceCharged: 100 }],
          afterServicePhotoUrls: [],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('maps InvalidBookingTransitionError to 422 when booking is PENDING', async () => {
      const line = new BookingLineBuilder().withLineId(LINE_ID).build();
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.PENDING)
        .withLines([line])
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .complete(booking.id, {
          lines: [{ lineId: LINE_ID, actualPriceCharged: 100 }],
          afterServicePhotoUrls: [],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('maps CompleteBookingLinesIncompleteError to 400 when a line is missing', async () => {
      const booking = approvedBookingWithLine();
      await bookingRepo.save(booking);

      const err = await controller
        .complete(booking.id, { lines: [], afterServicePhotoUrls: [] })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    });

    it('tenant isolation: cannot complete a booking from tenantB (returns 404)', async () => {
      const line = new BookingLineBuilder().withLineId(LINE_ID).build();
      const booking = new BookingBuilder()
        .withTenantId(TENANT_B)
        .withStatus(BookingStatus.APPROVED)
        .withLines([line])
        .build();
      await bookingRepo.save(booking);

      const err = await controller
        .complete(booking.id, {
          lines: [{ lineId: LINE_ID, actualPriceCharged: 100 }],
          afterServicePhotoUrls: [],
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.NOT_FOUND);
    });

    it('forwards discountByPoints to the use case (rejected here since the tenant rate is 0)', async () => {
      const booking = approvedBookingWithLine();
      await bookingRepo.save(booking);

      const err = await controller
        .complete(booking.id, {
          lines: [{ lineId: LINE_ID, actualPriceCharged: 100 }],
          afterServicePhotoUrls: [],
          discountByPoints: { pointsUsed: 100, amountDeducted: 10 },
        })
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });
  });
});
