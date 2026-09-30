import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryBookingStatusTransitionRepository } from '../../../../test/repositories/booking/in-memory-booking-status-transition.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  BookingAlreadyTerminalError,
  BookingNotFoundError,
  BookingNotYetEndedError,
  InvalidBookingTransitionError,
} from '../../domain/errors/booking-domain.error';
import { BookingNoShow } from '../../domain/events/booking-no-show.event';
import { MarkBookingNoShowUseCase } from './mark-booking-no-show.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000901';
const TENANT_B = '10000000-0000-4000-8000-000000000902';
const STAFF_ID = '20000000-0000-4000-8000-000000000901';
const CORRELATION_ID = 'corr-mark-no-show-test';

const ctx = {
  tenantId: TENANT_A,
  staffId: STAFF_ID,
  actorRole: 'STAFF' as const,
  correlationId: CORRELATION_ID,
};

function endedApproved(tenantId = TENANT_A): BookingBuilder {
  return new BookingBuilder()
    .withTenantId(tenantId)
    .withStatus(BookingStatus.APPROVED)
    .withScheduledAt(new Date(Date.now() - 2 * 3_600_000))
    .withTotalDurationMins(30);
}

describe('MarkBookingNoShowUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let transitionRepo: InMemoryBookingStatusTransitionRepository;
  let eventBus: InMemoryEventBus;
  let useCase: MarkBookingNoShowUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    bookingRepo = new InMemoryBookingRepository(eventBus);
    transitionRepo = new InMemoryBookingStatusTransitionRepository();
    useCase = new MarkBookingNoShowUseCase(
      bookingRepo,
      transitionRepo,
      new InMemoryTransactionManager(),
    );
  });

  it('marks an ended APPROVED booking as NO_SHOW, records the audit row and publishes BookingNoShow', async () => {
    const booking = endedApproved().build();
    await bookingRepo.save(booking);
    eventBus.clear();

    const result = await useCase.execute({
      bookingId: booking.id,
      reason: 'Cliente não atendeu o telefone.',
      ...ctx,
    });

    expect(result).toEqual({ bookingId: booking.id, status: BookingStatus.NO_SHOW });
    const [row] = transitionRepo.all();
    expect(transitionRepo.all()).toHaveLength(1);
    expect(row).toMatchObject({
      tenantId: TENANT_A,
      bookingId: booking.id,
      fromStatus: BookingStatus.APPROVED,
      toStatus: BookingStatus.NO_SHOW,
      reason: 'Cliente não atendeu o telefone.',
      actorType: 'STAFF',
      actorId: STAFF_ID,
      correlationId: CORRELATION_ID,
    });
    const published = eventBus.published;
    expect(published).toHaveLength(1);
    expect(published[0]).toBeInstanceOf(BookingNoShow);
  });

  it('records a MANAGER actor type and a null reason when none is given', async () => {
    const booking = endedApproved().build();
    await bookingRepo.save(booking);

    await useCase.execute({ bookingId: booking.id, ...ctx, actorRole: 'MANAGER' });

    expect(transitionRepo.all()[0]).toMatchObject({ actorType: 'MANAGER', reason: null });
  });

  it('throws BookingNotFoundError for an unknown booking', async () => {
    await expect(
      useCase.execute({ bookingId: '00000000-0000-4000-8000-000000009999', ...ctx }),
    ).rejects.toThrow(BookingNotFoundError);
  });

  it('tenant isolation: a booking of another tenant is not found and nothing is recorded', async () => {
    const booking = endedApproved(TENANT_B).build();
    await bookingRepo.save(booking);

    await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
      BookingNotFoundError,
    );
    expect(transitionRepo.all()).toHaveLength(0);
  });

  it('rejects an appointment that has not ended and records nothing', async () => {
    const booking = endedApproved()
      .withScheduledAt(new Date(Date.now() + 3_600_000))
      .build();
    await bookingRepo.save(booking);

    await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
      BookingNotYetEndedError,
    );
    expect(transitionRepo.all()).toHaveLength(0);
  });

  it.each([BookingStatus.COMPLETED, BookingStatus.CANCELLED, BookingStatus.NO_SHOW])(
    'rejects a %s booking as already terminal',
    async (status) => {
      const booking = endedApproved().withStatus(status).build();
      await bookingRepo.save(booking);

      await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
        BookingAlreadyTerminalError,
      );
    },
  );

  it('rejects a PENDING booking as an invalid transition', async () => {
    const booking = endedApproved().withStatus(BookingStatus.PENDING).build();
    await bookingRepo.save(booking);

    await expect(useCase.execute({ bookingId: booking.id, ...ctx })).rejects.toThrow(
      InvalidBookingTransitionError,
    );
  });
});
