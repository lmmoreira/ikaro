import { ResourceBuilder } from '../../../../test/builders/booking/resource.builder';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { ResourceType } from '../../domain/resource.types';
import {
  loadPickedResourceNames,
  toRecurringBookingScheduleResult,
} from './recurring-booking-schedule-result.helpers';

function schedule(
  status: 'ACTIVE' | 'PENDING_APPROVAL',
  assignmentPolicy: 'FIXED_ASSIGNMENT' | 'RESOLVE_PER_OCCURRENCE' = 'FIXED_ASSIGNMENT',
): RecurringBookingSchedule {
  return RecurringBookingSchedule.request({
    tenantId: '10000000-0000-4000-8000-000000000401',
    customerId: 'customer-a',
    serviceId: 'service-1',
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday', 'thursday'],
      startTime: '10:00',
      durationMinutes: 120,
    },
    startsOn: '2026-09-01',
    endsOn: '2026-11-24',
    maxTermDays: 90,
    assignmentPolicy,
    resourceAssignments:
      assignmentPolicy === 'FIXED_ASSIGNMENT'
        ? [
            {
              resourceId: 'res-1',
              resourceType: ResourceType.ROOM,
              requirementId: null,
              requiredQuantityPosition: null,
            },
          ]
        : [],
    status,
    approvalHoldExpiresAt: status === 'PENDING_APPROVAL' ? new Date('2099-01-01T00:00:00Z') : null,
    createdByStaffId: null,
    correlationId: 'corr-1',
  });
}

describe('toRecurringBookingScheduleResult', () => {
  it('maps every field of the wire shape, including the service name', () => {
    const s = schedule('ACTIVE');

    expect(toRecurringBookingScheduleResult(s, 'Sala Aurora', true)).toEqual({
      id: s.id,
      customerId: 'customer-a',
      serviceId: 'service-1',
      serviceName: 'Sala Aurora',
      recurrence: {
        frequency: 'WEEKLY',
        daysOfWeek: ['tuesday', 'thursday'],
        startTime: '10:00',
        durationMinutes: 120,
      },
      startsOn: '2026-09-01',
      endsOn: '2026-11-24',
      status: 'ACTIVE',
      assignmentPolicy: 'FIXED_ASSIGNMENT',
      resourceIds: ['res-1'],
      resourceAssignments: [{ resourceType: ResourceType.ROOM, resourceId: 'res-1' }],
      approvalHoldExpiresAt: null,
      createdAt: s.createdAt.toISOString(),
      renewable: true,
    });
  });

  it('has no resource ids when the resource is resolved per occurrence', () => {
    const s = schedule('ACTIVE', 'RESOLVE_PER_OCCURRENCE');

    const result = toRecurringBookingScheduleResult(s, 'Sala Aurora', false);
    expect(result.resourceIds).toEqual([]);
    expect(result.resourceAssignments).toEqual([]);
  });

  it('serializes the approval-hold expiry as an ISO string for a pending schedule', () => {
    const result = toRecurringBookingScheduleResult(
      schedule('PENDING_APPROVAL'),
      'Sala Aurora',
      false,
    );

    expect(result.status).toBe('PENDING_APPROVAL');
    expect(result.approvalHoldExpiresAt).toBe('2099-01-01T00:00:00.000Z');
  });

  it('adds a resource name to each pick only when it is given the names (a STAFF|MANAGER read)', () => {
    const s = schedule('ACTIVE');

    const named = toRecurringBookingScheduleResult(
      s,
      'Sala Aurora',
      false,
      new Map([['res-1', 'Sala Lumen']]),
    );
    const unnamed = toRecurringBookingScheduleResult(s, 'Sala Aurora', false);

    expect(named.resourceAssignments).toEqual([
      { resourceType: ResourceType.ROOM, resourceId: 'res-1', resourceName: 'Sala Lumen' },
    ]);
    expect(unnamed.resourceAssignments).toEqual([
      { resourceType: ResourceType.ROOM, resourceId: 'res-1' },
    ]);
  });

  it('leaves a pick without a name when the names do not cover it', () => {
    const result = toRecurringBookingScheduleResult(
      schedule('ACTIVE'),
      'Sala Aurora',
      false,
      new Map([['another-resource', 'Outra']]),
    );

    expect(result.resourceAssignments?.[0]).not.toHaveProperty('resourceName');
  });

  it('returns the creation time as an ISO-8601 UTC string, for any status', () => {
    const pending = schedule('PENDING_APPROVAL');

    const result = toRecurringBookingScheduleResult(pending, 'Sala Aurora', false);

    expect(result.createdAt).toBe(pending.createdAt.toISOString());
    expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
  });
});

describe('loadPickedResourceNames', () => {
  const TENANT = '10000000-0000-4000-8000-000000000401';

  function scheduleWithPick(resourceId: string): RecurringBookingSchedule {
    return RecurringBookingSchedule.request({
      tenantId: TENANT,
      customerId: 'customer-a',
      serviceId: 'service-1',
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
          resourceId,
          resourceType: ResourceType.ROOM,
          requirementId: null,
          requiredQuantityPosition: null,
        },
      ],
      status: 'ACTIVE',
      approvalHoldExpiresAt: null,
      createdByStaffId: null,
      correlationId: 'corr-1',
    });
  }

  it('maps every picked resource id to its name, across several schedules', async () => {
    const repo = new InMemoryResourceRepository();
    const aurora = new ResourceBuilder().withTenantId(TENANT).withName('Sala Aurora').build();
    const lumen = new ResourceBuilder().withTenantId(TENANT).withName('Sala Lumen').build();
    await repo.save(aurora);
    await repo.save(lumen);

    const names = await loadPickedResourceNames(repo, TENANT, [
      scheduleWithPick(aurora.id),
      scheduleWithPick(lumen.id),
      scheduleWithPick(aurora.id),
    ]);

    expect(Object.fromEntries(names)).toEqual({
      [aurora.id]: 'Sala Aurora',
      [lumen.id]: 'Sala Lumen',
    });
  });

  it('asks for each resource once, however many schedules pick it', async () => {
    const repo = new InMemoryResourceRepository();
    const aurora = new ResourceBuilder().withTenantId(TENANT).withName('Sala Aurora').build();
    await repo.save(aurora);
    const spy = jest.spyOn(repo, 'findByIds');

    await loadPickedResourceNames(repo, TENANT, [
      scheduleWithPick(aurora.id),
      scheduleWithPick(aurora.id),
    ]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith([aurora.id], TENANT);
  });

  it('reads nothing when no schedule picked a resource', async () => {
    const repo = new InMemoryResourceRepository();
    const spy = jest.spyOn(repo, 'findByIds');

    const names = await loadPickedResourceNames(repo, TENANT, []);

    expect(names.size).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it('leaves out a resource of another tenant (a foreign id is simply absent)', async () => {
    const repo = new InMemoryResourceRepository();
    const foreign = new ResourceBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000499')
      .withName('Alheia')
      .build();
    await repo.save(foreign);

    const names = await loadPickedResourceNames(repo, TENANT, [scheduleWithPick(foreign.id)]);

    expect(names.size).toBe(0);
  });
});
