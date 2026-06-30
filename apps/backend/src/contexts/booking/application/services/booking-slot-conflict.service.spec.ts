import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { futureDate } from '../../../../test/utils/date-helpers';
import { BookingSlotUnavailableError } from '../../domain/errors/booking-domain.error';
import { BookingSlotConflictService } from './booking-slot-conflict.service';

const TENANT_ID = '10000000-0000-4000-8000-000000000300';
const TZ = 'America/Sao_Paulo';
const scheduledAt = new Date(`${futureDate(5)}T13:00:00.000Z`);

describe('BookingSlotConflictService', () => {
  let availabilityPort: InMemoryBookingAvailabilityPort;
  let service: BookingSlotConflictService;

  beforeEach(() => {
    availabilityPort = new InMemoryBookingAvailabilityPort();
    service = new BookingSlotConflictService(availabilityPort);
  });

  it('resolves when no existing slots', async () => {
    await expect(service.assertSlotFree(TENANT_ID, scheduledAt, 30, TZ)).resolves.toBeUndefined();
  });

  it('throws BookingSlotUnavailableError when slot exactly overlaps', async () => {
    availabilityPort.setSlots([{ id: 'slot-test-id', scheduledAt, totalDurationMins: 60 }]);
    await expect(service.assertSlotFree(TENANT_ID, scheduledAt, 30, TZ)).rejects.toThrow(
      BookingSlotUnavailableError,
    );
  });

  it('throws when new booking starts inside an existing slot', async () => {
    const before = new Date(scheduledAt.getTime() - 15 * 60_000);
    availabilityPort.setSlots([{ id: 'slot-test-id', scheduledAt: before, totalDurationMins: 60 }]);
    await expect(service.assertSlotFree(TENANT_ID, scheduledAt, 30, TZ)).rejects.toThrow(
      BookingSlotUnavailableError,
    );
  });

  it('allows booking when adjacent slot comes after (non-overlapping)', async () => {
    const after = new Date(scheduledAt.getTime() + 30 * 60_000);
    availabilityPort.setSlots([{ id: 'slot-test-id', scheduledAt: after, totalDurationMins: 30 }]);
    await expect(service.assertSlotFree(TENANT_ID, scheduledAt, 30, TZ)).resolves.toBeUndefined();
  });

  it('allows booking when adjacent slot comes before (non-overlapping)', async () => {
    const before = new Date(scheduledAt.getTime() - 30 * 60_000);
    availabilityPort.setSlots([{ id: 'slot-test-id', scheduledAt: before, totalDurationMins: 30 }]);
    await expect(service.assertSlotFree(TENANT_ID, scheduledAt, 30, TZ)).resolves.toBeUndefined();
  });

  it('excludes the specified bookingId from conflict check (rescheduling self-overlap)', async () => {
    const BOOKING_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
    availabilityPort.setSlots([{ id: BOOKING_ID, scheduledAt, totalDurationMins: 60 }]);
    await expect(
      service.assertSlotFree(TENANT_ID, scheduledAt, 30, TZ, BOOKING_ID),
    ).resolves.toBeUndefined();
  });

  it('still detects conflict from a different booking when excludeBookingId is set', async () => {
    const OTHER_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
    availabilityPort.setSlots([{ id: OTHER_ID, scheduledAt, totalDurationMins: 60 }]);
    await expect(
      service.assertSlotFree(TENANT_ID, scheduledAt, 30, TZ, 'aaaaaaaa-0000-4000-8000-000000000001'),
    ).rejects.toThrow(BookingSlotUnavailableError);
  });
});
