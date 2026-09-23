import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { GetScheduleDayGridUseCase } from '../../application/use-cases/get-schedule-day-grid.use-case';
import { ScheduleDayGridController } from './schedule-day-grid.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('ScheduleDayGridController', () => {
  let resourceRepo: InMemoryResourceRepository;
  let bookingPort: InMemoryBookingAvailabilityPort;
  let controller: ScheduleDayGridController;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
    bookingPort = new InMemoryBookingAvailabilityPort();
    const ctx = new RequestContextBuilder().withTenantId(TENANT_ID).build();
    controller = new ScheduleDayGridController(
      ctx,
      new GetScheduleDayGridUseCase(resourceRepo, bookingPort),
    );
  });

  it('returns the day grid for the requested date, using the tenant timezone', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).withName('Estúdio 1').build();
    await resourceRepo.save(resource);

    const result = await controller.get({ date: '2026-06-01' });

    expect(result.date).toBe('2026-06-01');
    expect(result.columns).toEqual([
      expect.objectContaining({ resourceId: resource.id, name: 'Estúdio 1' }),
    ]);
  });
});
