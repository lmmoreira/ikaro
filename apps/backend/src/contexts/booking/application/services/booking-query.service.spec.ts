import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/booking.builder';
import { BookingQueryService } from './booking-query.service';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('BookingQueryService', () => {
  let repo: InMemoryBookingRepository;
  let service: BookingQueryService;

  beforeEach(() => {
    repo = new InMemoryBookingRepository();
    service = new BookingQueryService(repo);
  });

  it('returns the booking when it exists for the tenant', async () => {
    const booking = new BookingBuilder().withTenantId(TENANT_A).build();
    await repo.save(booking);

    const result = await service.findById(booking.id, TENANT_A);

    expect(result?.id).toBe(booking.id);
  });

  it('returns null when the booking does not exist', async () => {
    const result = await service.findById('00000000-0000-4000-8000-000000000099', TENANT_A);

    expect(result).toBeNull();
  });

  it('tenant isolation: does not return a booking owned by another tenant', async () => {
    const booking = new BookingBuilder().withTenantId(TENANT_B).build();
    await repo.save(booking);

    const result = await service.findById(booking.id, TENANT_A);

    expect(result).toBeNull();
  });
});
