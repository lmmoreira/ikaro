import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingStatusTransitionRepository } from '../../../../test/repositories/booking/in-memory-booking-status-transition.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingNotFoundError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { BookingCompleted } from '../../domain/events/booking-completed.event';
import { CorrectBookingNoShowUseCase } from './correct-booking-no-show.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000911';
const TENANT_B = '10000000-0000-4000-8000-000000000912';
const MANAGER_ID = '20000000-0000-4000-8000-000000000911';
const CORRELATION_ID = 'corr-correct-no-show-test';

const ctx = {
  tenantId: TENANT_A,
  staffId: MANAGER_ID,
  correlationId: CORRELATION_ID,
  correctedStatus: 'COMPLETED' as const,
  reason: 'Cliente chegou atrasado e foi atendido.',
};

function noShow(tenantId = TENANT_A): BookingBuilder {
  return new BookingBuilder().withTenantId(tenantId).withStatus(BookingStatus.NO_SHOW);
}

describe('CorrectBookingNoShowUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let transitionRepo: InMemoryBookingStatusTransitionRepository;
  let eventBus: InMemoryEventBus;
  let useCase: CorrectBookingNoShowUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    transitionRepo = new InMemoryBookingStatusTransitionRepository();
    bookingRepo = new InMemoryBookingRepository(eventBus, transitionRepo);
    useCase = new CorrectBookingNoShowUseCase(bookingRepo, new InMemoryTransactionManager());
  });

  it('completes the no-show, records the correction row and publishes BookingCompleted only', async () => {
    const booking = noShow().build();
    await bookingRepo.save(booking);
    eventBus.clear();

    const result = await useCase.execute({ bookingId: booking.id, ...ctx });

    expect(result.status).toBe(BookingStatus.COMPLETED);
    expect(result.bookingId).toBe(booking.id);
    expect(typeof result.completedAt).toBe('string');
    const rows = transitionRepo.all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: TENANT_A,
      bookingId: booking.id,
      fromStatus: BookingStatus.NO_SHOW,
      toStatus: BookingStatus.COMPLETED,
      reason: ctx.reason,
      actorType: 'MANAGER',
      actorId: MANAGER_ID,
      correlationId: CORRELATION_ID,
    });
    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0]).toBeInstanceOf(BookingCompleted);
  });

  it('throws BookingNotFoundError for an unknown booking', async () => {
    await expect(
      useCase.execute({ bookingId: '00000000-0000-4000-8000-000000009999', ...ctx }),
    ).rejects.toThrow(BookingNotFoundError);
  });

  it('tenant isolation: a no-show of another tenant is not found and nothing is recorded', async () => {
    const booking = noShow(TENANT_B).build();
    await bookingRepo.save(booking);

    await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
      BookingNotFoundError,
    );
    expect(transitionRepo.all()).toHaveLength(0);
  });

  it('rejects a booking that is not NO_SHOW and records nothing', async () => {
    const booking = noShow().withStatus(BookingStatus.APPROVED).build();
    await bookingRepo.save(booking);

    await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
      InvalidBookingTransitionError,
    );
    expect(transitionRepo.all()).toHaveLength(0);
  });
});
