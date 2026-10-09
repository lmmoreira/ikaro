import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { ListRecurringBookingSchedulesUseCase } from './list-recurring-booking-schedules.use-case';

const TENANT = '10000000-0000-4000-8000-000000000401';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000499';
const PAGE = { limit: 25, offset: 0 };

function schedule(
  customerId: string,
  tenantId = TENANT,
  status: 'ACTIVE' | 'PENDING_APPROVAL' = 'ACTIVE',
  serviceId = 'service-1',
): RecurringBookingSchedule {
  return RecurringBookingSchedule.request({
    tenantId,
    customerId,
    serviceId,
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 60,
    },
    startsOn: '2026-09-01',
    endsOn: '2026-11-24',
    maxTermDays: 90,
    assignmentPolicy: 'FIXED_ASSIGNMENT',
    resourceAssignments: [
      {
        resourceId: 'res-1',
        resourceType: ResourceType.ROOM,
        requirementId: null,
        requiredQuantityPosition: null,
      },
    ],
    status,
    approvalHoldExpiresAt: status === 'PENDING_APPROVAL' ? new Date('2099-01-01T00:00:00Z') : null,
    createdByStaffId: null,
    correlationId: 'corr-1',
  });
}

describe('ListRecurringBookingSchedulesUseCase', () => {
  let repo: InMemoryRecurringBookingScheduleRepository;
  let serviceRepo: InMemoryServiceRepository;
  let useCase: ListRecurringBookingSchedulesUseCase;

  beforeEach(async () => {
    repo = new InMemoryRecurringBookingScheduleRepository(new InMemoryEventBus());
    serviceRepo = new InMemoryServiceRepository();
    await serviceRepo.save(
      new ServiceBuilder().withId('service-1').withTenantId(TENANT).withName('Sala Aurora').build(),
    );
    useCase = new ListRecurringBookingSchedulesUseCase(repo, serviceRepo);
  });

  it("maps each item's serviceName from the service", async () => {
    repo.seed(schedule('customer-a'));

    const result = await useCase.execute({ tenantId: TENANT, ...PAGE });

    expect(result.items[0].serviceName).toBe('Sala Aurora');
  });

  it('reads the services of a page once, not once per row', async () => {
    await serviceRepo.save(
      new ServiceBuilder()
        .withId('service-2')
        .withTenantId(TENANT)
        .withName('Sala Horizonte')
        .build(),
    );
    repo.seed(schedule('customer-a'));
    repo.seed(schedule('customer-b'));
    repo.seed(schedule('customer-c', TENANT, 'ACTIVE', 'service-2'));
    const findByIds = jest.spyOn(serviceRepo, 'findByIds');

    const result = await useCase.execute({ tenantId: TENANT, ...PAGE });

    // The ids come in repository order (schedules created in the same millisecond have no stable
    // order), so only the set of ids and the single tenant-scoped call are asserted.
    expect(findByIds).toHaveBeenCalledTimes(1);
    const [requestedIds, requestedTenant] = findByIds.mock.calls[0];
    expect([...requestedIds].sort()).toEqual(['service-1', 'service-2']);
    expect(requestedTenant).toBe(TENANT);
    expect(result.items.map((i) => i.serviceName).sort()).toEqual([
      'Sala Aurora',
      'Sala Aurora',
      'Sala Horizonte',
    ]);
  });

  it("never resolves a service name from another tenant's service", async () => {
    const otherTenantRepo = new InMemoryServiceRepository();
    await otherTenantRepo.save(
      new ServiceBuilder().withId('service-1').withTenantId(OTHER_TENANT).withName('Outro').build(),
    );
    const isolated = new ListRecurringBookingSchedulesUseCase(repo, otherTenantRepo);
    repo.seed(schedule('customer-a'));

    await expect(isolated.execute({ tenantId: TENANT, ...PAGE })).rejects.toThrow(
      'Service service-1',
    );
  });

  it('returns no items and looks up no service ids for an empty page', async () => {
    const findByIds = jest.spyOn(serviceRepo, 'findByIds');

    const result = await useCase.execute({ tenantId: TENANT, ...PAGE });

    expect(result.items).toEqual([]);
    expect(findByIds).toHaveBeenCalledWith([], TENANT);
  });

  it('returns every schedule for the tenant when customerId is omitted (STAFF|MANAGER)', async () => {
    repo.seed(schedule('customer-a'));
    repo.seed(schedule('customer-b'));

    const result = await useCase.execute({ tenantId: TENANT, ...PAGE });

    expect(result.items).toHaveLength(2);
  });

  it("scopes to the caller's own schedules when customerId is set (CUSTOMER)", async () => {
    repo.seed(schedule('customer-a'));
    repo.seed(schedule('customer-b'));

    const result = await useCase.execute({ tenantId: TENANT, customerId: 'customer-a', ...PAGE });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].customerId).toBe('customer-a');
  });

  it('maps each item with the expected shape', async () => {
    repo.seed(schedule('customer-a'));

    const result = await useCase.execute({ tenantId: TENANT, ...PAGE });

    expect(result.items[0]).toMatchObject({
      customerId: 'customer-a',
      serviceId: 'service-1',
      status: 'ACTIVE',
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      approvalHoldExpiresAt: null,
    });
  });

  it('never returns a schedule that belongs to a different tenant', async () => {
    repo.seed(schedule('customer-a'));
    repo.seed(schedule('customer-a', OTHER_TENANT));

    const result = await useCase.execute({ tenantId: TENANT, ...PAGE });

    expect(result.items).toHaveLength(1);
    expect(result.items.every((item) => item.customerId === 'customer-a')).toBe(true);
  });

  it('returns a bounded page and reports total/hasMore', async () => {
    for (let i = 0; i < 3; i++) repo.seed(schedule(`customer-${i}`));

    const result = await useCase.execute({ tenantId: TENANT, limit: 2, offset: 0 });

    expect(result.items).toHaveLength(2);
    expect(result.pagination).toEqual({ limit: 2, offset: 0, total: 3, hasMore: true });
  });

  it('returns the remainder on the second page with hasMore false', async () => {
    for (let i = 0; i < 3; i++) repo.seed(schedule(`customer-${i}`));

    const first = await useCase.execute({ tenantId: TENANT, limit: 2, offset: 0 });
    const second = await useCase.execute({ tenantId: TENANT, limit: 2, offset: 2 });

    expect(second.items).toHaveLength(1);
    expect(second.pagination).toEqual({ limit: 2, offset: 2, total: 3, hasMore: false });
    const ids = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('returns an empty page with total 0 and hasMore false when nothing matches', async () => {
    const result = await useCase.execute({ tenantId: TENANT, ...PAGE });

    expect(result.items).toEqual([]);
    expect(result.pagination).toEqual({ limit: 25, offset: 0, total: 0, hasMore: false });
  });

  it('filters by status and counts only matching rows in total', async () => {
    repo.seed(schedule('customer-a', TENANT, 'ACTIVE'));
    repo.seed(schedule('customer-b', TENANT, 'PENDING_APPROVAL'));
    repo.seed(schedule('customer-c', TENANT, 'PENDING_APPROVAL'));

    const result = await useCase.execute({
      tenantId: TENANT,
      status: 'PENDING_APPROVAL',
      ...PAGE,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.status === 'PENDING_APPROVAL')).toBe(true);
    expect(result.pagination.total).toBe(2);
  });

  it("never counts another tenant's schedules toward total", async () => {
    repo.seed(schedule('customer-a'));
    repo.seed(schedule('customer-a', OTHER_TENANT));

    const result = await useCase.execute({ tenantId: TENANT, ...PAGE });

    expect(result.pagination.total).toBe(1);
  });
});
