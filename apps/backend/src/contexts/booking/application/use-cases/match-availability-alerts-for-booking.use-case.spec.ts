import { BookingBuilder } from '../../../../test/builders/booking/index';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { MatchAvailabilityAlertsForBookingUseCase } from './match-availability-alerts-for-booking.use-case';
import { MatchAvailabilityAlertsUseCase } from './match-availability-alerts.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '99999999-0000-7000-8000-000000000099';
const CORRELATION_ID = 'corr-for-booking-1';

describe('MatchAvailabilityAlertsForBookingUseCase', () => {
  let bookingRepo: InMemoryBookingRepository;
  let matchAlerts: jest.Mocked<Pick<MatchAvailabilityAlertsUseCase, 'execute'>>;
  let useCase: MatchAvailabilityAlertsForBookingUseCase;

  beforeEach(() => {
    bookingRepo = new InMemoryBookingRepository();
    matchAlerts = { execute: jest.fn().mockResolvedValue({ notified: 1 }) };
    useCase = new MatchAvailabilityAlertsForBookingUseCase(
      bookingRepo,
      matchAlerts as unknown as MatchAvailabilityAlertsUseCase,
    );
  });

  it("re-checks the booking's own day for the services on its lines", async () => {
    const booking = new BookingBuilder().withTenantId(TENANT_ID).build();
    await bookingRepo.save(booking);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      bookingId: booking.id,
      correlationId: CORRELATION_ID,
    });

    expect(result).toEqual({ notified: 1 });
    expect(matchAlerts.execute).toHaveBeenCalledTimes(1);
    expect(matchAlerts.execute).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      correlationId: CORRELATION_ID,
      serviceIds: booking.lines.map((line) => line.serviceId),
      around: booking.scheduledAt,
    });
  });

  it('does nothing when the booking no longer exists', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_ID,
      bookingId: '00000000-0000-7000-8000-0000000000bb',
      correlationId: CORRELATION_ID,
    });

    expect(result).toEqual({ notified: 0 });
    expect(matchAlerts.execute).not.toHaveBeenCalled();
  });

  it("tenant isolation: never resolves another tenant's booking", async () => {
    const booking = new BookingBuilder().withTenantId(OTHER_TENANT_ID).build();
    await bookingRepo.save(booking);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      bookingId: booking.id,
      correlationId: CORRELATION_ID,
    });

    expect(result).toEqual({ notified: 0 });
    expect(matchAlerts.execute).not.toHaveBeenCalled();
  });
});
