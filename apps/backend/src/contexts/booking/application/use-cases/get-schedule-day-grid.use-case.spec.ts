import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryBookingAvailabilityPort } from '../../../../test/infrastructure/in-memory-booking-availability';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { ResourceType } from '../../domain/resource.types';
import { GetScheduleDayGridUseCase } from './get-schedule-day-grid.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000099';

describe('GetScheduleDayGridUseCase', () => {
  let resourceRepo: InMemoryResourceRepository;
  let bookingPort: InMemoryBookingAvailabilityPort;
  let useCase: GetScheduleDayGridUseCase;

  beforeEach(() => {
    resourceRepo = new InMemoryResourceRepository();
    bookingPort = new InMemoryBookingAvailabilityPort();
    useCase = new GetScheduleDayGridUseCase(resourceRepo, bookingPort);
  });

  it('assembles one column per active resource, empty blocks for an unoccupied resource', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .withName('Estúdio 1')
      .build();
    await resourceRepo.save(resource);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      date: '2026-06-01',
      timezone: 'America/Sao_Paulo',
    });

    expect(result.date).toBe('2026-06-01');
    expect(result.columns).toEqual([
      { resourceId: resource.id, name: 'Estúdio 1', type: ResourceType.ROOM, blocks: [] },
    ]);
  });

  it('places occupancy blocks under their own resource column', async () => {
    const resourceA = new ResourceBuilder().withTenantId(TENANT_ID).withName('Camila').build();
    const resourceB = new ResourceBuilder().withTenantId(TENANT_ID).withName('Bruno').build();
    await resourceRepo.save(resourceA);
    await resourceRepo.save(resourceB);

    bookingPort.setDayGridBlocks([
      {
        resourceId: resourceA.id,
        startsAt: new Date('2026-06-01T10:00:00.000Z'),
        endsAt: new Date('2026-06-01T11:00:00.000Z'),
        kind: 'BOOKING',
        refId: 'booking-1',
      },
    ]);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      date: '2026-06-01',
      timezone: 'America/Sao_Paulo',
    });

    const columnA = result.columns.find((c) => c.resourceId === resourceA.id);
    const columnB = result.columns.find((c) => c.resourceId === resourceB.id);

    expect(columnA?.blocks).toEqual([
      {
        startsAt: '2026-06-01T10:00:00.000Z',
        endsAt: '2026-06-01T11:00:00.000Z',
        kind: 'BOOKING',
        refId: 'booking-1',
      },
    ]);
    expect(columnB?.blocks).toEqual([]);
  });

  it('returns a valid empty response for a tenant with no active resources', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_ID,
      date: '2026-06-01',
      timezone: 'America/Sao_Paulo',
    });

    expect(result.columns).toEqual([]);
  });

  it('never includes another tenant’s resources', async () => {
    const ownResource = new ResourceBuilder().withTenantId(TENANT_ID).withName('Mine').build();
    const otherResource = new ResourceBuilder()
      .withTenantId(OTHER_TENANT_ID)
      .withName('Theirs')
      .build();
    await resourceRepo.save(ownResource);
    await resourceRepo.save(otherResource);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      date: '2026-06-01',
      timezone: 'America/Sao_Paulo',
    });

    expect(result.columns).toHaveLength(1);
    expect(result.columns[0].resourceId).toBe(ownResource.id);
  });
});
