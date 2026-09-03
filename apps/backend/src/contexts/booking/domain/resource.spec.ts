import type { BusinessHours } from '../../../shared/value-objects/business-hours.vo';
import {
  EMPTY_BUSINESS_HOURS,
  FULL_WEEK_BUSINESS_HOURS,
} from '../../../test/utils/business-hours-fixtures';
import {
  ResourceAlreadyActiveError,
  ResourceLocationCannotBeDeactivatedError,
  ResourceLocationTypeImmutableError,
  ResourceLocationWorkingHoursImmutableError,
  ResourceMaxCapacityInvalidError,
  ResourceNoWorkingHoursError,
  ResourceTypeRefIdMismatchError,
  ResourceWorkingHoursOutsideTenantHoursError,
} from './errors/resource.error';
import { Resource } from './resource.aggregate';
import { ResourceType, ResourceWorkingHours } from './resource.types';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';

describe('Resource.create()', () => {
  it('creates a ROOM resource inheriting tenant hours', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    expect(resource.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(resource.tenantId).toBe(TENANT_ID);
    expect(resource.type).toBe(ResourceType.ROOM);
    expect(resource.refId).toBeNull();
    expect(resource.workingHours).toBeNull();
    expect(resource.turnoverMinutes).toBe(0);
    expect(resource.maxCapacity).toBeNull();
    expect(resource.isActive).toBe(true);
  });

  it('creates a STAFF resource with a refId', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.STAFF,
      name: 'Camila Duarte',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      refId: STAFF_ID,
    });

    expect(resource.type).toBe(ResourceType.STAFF);
    expect(resource.refId).toBe(STAFF_ID);
  });

  it('rejects type=STAFF with no refId', () => {
    expect(() =>
      Resource.create({
        tenantId: TENANT_ID,
        type: ResourceType.STAFF,
        name: 'Camila Duarte',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      }),
    ).toThrow(ResourceTypeRefIdMismatchError);
  });

  it('rejects a non-STAFF type with a refId set', () => {
    expect(() =>
      Resource.create({
        tenantId: TENANT_ID,
        type: ResourceType.ROOM,
        name: 'Estúdio 1',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        refId: STAFF_ID,
      }),
    ).toThrow(ResourceTypeRefIdMismatchError);
  });

  it('rejects maxCapacity <= 0', () => {
    expect(() =>
      Resource.create({
        tenantId: TENANT_ID,
        type: ResourceType.ROOM,
        name: 'Estúdio 1',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        maxCapacity: 0,
      }),
    ).toThrow(ResourceMaxCapacityInvalidError);
  });

  it('accepts maxCapacity > 0', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      maxCapacity: 12,
    });
    expect(resource.maxCapacity).toBe(12);
  });

  it('rejects maxCapacity set for type=STAFF', () => {
    expect(() =>
      Resource.create({
        tenantId: TENANT_ID,
        type: ResourceType.STAFF,
        name: 'Camila Duarte',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        refId: STAFF_ID,
        maxCapacity: 1,
      }),
    ).toThrow(ResourceMaxCapacityInvalidError);
  });

  it('accepts a STAFF resource with no maxCapacity', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.STAFF,
      name: 'Camila Duarte',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      refId: STAFF_ID,
    });
    expect(resource.maxCapacity).toBeNull();
  });

  it('rejects a workingHours window outside the tenant business hours', () => {
    expect(() =>
      Resource.create({
        tenantId: TENANT_ID,
        type: ResourceType.ROOM,
        name: 'Estúdio 1',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        workingHours: {
          monday: { open: '08:00', close: '18:00' },
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: null,
          sunday: null,
        },
      }),
    ).toThrow(ResourceWorkingHoursOutsideTenantHoursError);
  });

  it('rejects a workingHours day the tenant is fully closed on', () => {
    expect(() =>
      Resource.create({
        tenantId: TENANT_ID,
        type: ResourceType.ROOM,
        name: 'Estúdio 1',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        workingHours: {
          monday: null,
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: { open: '09:00', close: '12:00' },
          sunday: null,
        },
      }),
    ).toThrow(ResourceWorkingHoursOutsideTenantHoursError);
  });

  it('accepts a workingHours window that is a subset of tenant hours', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      workingHours: {
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
    });
    expect(resource.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });

  it('rejects no working hours when tenant also has none', () => {
    expect(() =>
      Resource.create({
        tenantId: TENANT_ID,
        type: ResourceType.ROOM,
        name: 'Estúdio 1',
        tenantBusinessHours: EMPTY_BUSINESS_HOURS,
      }),
    ).toThrow(ResourceNoWorkingHoursError);
  });

  it('rejects an explicit all-null-day workingHours object when tenant also has none', () => {
    // A non-null object with every day set to null is a different value from `workingHours:
    // null` but represents the same unschedulable state — assertWorkingHoursSubsetOfTenant()
    // treats it as a no-op (nothing to validate), so it must not silently bypass this rule
    // (Codex round-5 finding, PR #457).
    expect(() =>
      Resource.create({
        tenantId: TENANT_ID,
        type: ResourceType.ROOM,
        name: 'Estúdio 1',
        tenantBusinessHours: EMPTY_BUSINESS_HOURS,
        workingHours: {
          monday: null,
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: null,
          sunday: null,
        },
      }),
    ).toThrow(ResourceNoWorkingHoursError);
  });

  it('accepts an all-null-day workingHours object when the tenant has its own hours', () => {
    // Not the bug — an explicit all-closed override is only unschedulable when the tenant
    // has nothing to fall back on either; here the tenant hours make it a deliberate (if
    // unusual) fully-closed override, not an unschedulable resource.
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      workingHours: {
        monday: null,
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
    });
    expect(resource.workingHours).toEqual({
      monday: null,
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    });
  });

  it('does not expose the caller-owned workingHours object by reference', () => {
    const workingHours = {
      monday: { open: '10:00', close: '16:00' },
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    };
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      workingHours,
    });

    workingHours.monday = { open: '00:00', close: '01:00' };

    expect(resource.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });

  it('does not let a caller mutate stored state through the constructor input day sub-object', () => {
    const workingHours = {
      monday: { open: '10:00', close: '16:00' },
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    };
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      workingHours,
    });

    // Mutates the nested day object in place, rather than reassigning the top-level key — a
    // shallow `{ ...workingHours }` copy shares this exact object by reference (Codex round-4
    // finding, PR #457).
    workingHours.monday.open = '00:00';

    expect(resource.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });

  it('does not let a caller mutate stored state through the workingHours getter return value', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      workingHours: {
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
    });

    const firstRead = resource.workingHours;
    if (firstRead?.monday) firstRead.monday.open = '00:00';

    expect(resource.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });
});

describe('Resource.update()', () => {
  // Mirrors UpdateResourceUseCase's own merge — keeps the workingHours-only tests below focused
  // on the field they're actually testing, matching every other other field's current value.
  function updateWorkingHours(
    resource: Resource,
    workingHours: ResourceWorkingHours | null,
    tenantBusinessHours: BusinessHours,
  ): void {
    resource.update(
      resource.name,
      resource.type,
      resource.refId,
      workingHours,
      resource.turnoverMinutes,
      resource.maxCapacity,
      tenantBusinessHours,
    );
  }

  it('updates working hours when valid', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });
    updateWorkingHours(
      resource,
      {
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
      FULL_WEEK_BUSINESS_HOURS,
    );
    expect(resource.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });

  it('reverts to inheriting tenant hours when set to null', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      workingHours: {
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
    });
    updateWorkingHours(resource, null, FULL_WEEK_BUSINESS_HOURS);
    expect(resource.workingHours).toBeNull();
  });

  it('rejects an outside-tenant-hours update', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });
    expect(() =>
      updateWorkingHours(
        resource,
        {
          monday: { open: '08:00', close: '18:00' },
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: null,
          sunday: null,
        },
        FULL_WEEK_BUSINESS_HOURS,
      ),
    ).toThrow(ResourceWorkingHoursOutsideTenantHoursError);
  });

  it("rejects clearing working hours to null when the tenant also has none (mirrors create()'s own rule)", () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      workingHours: {
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
    });

    expect(() => updateWorkingHours(resource, null, EMPTY_BUSINESS_HOURS)).toThrow(
      ResourceNoWorkingHoursError,
    );
    // Rejected update must not have mutated the existing, valid working hours.
    expect(resource.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });

  it('rejects updating to an explicit all-null-day workingHours object when the tenant also has none', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      workingHours: {
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
    });

    expect(() =>
      updateWorkingHours(
        resource,
        {
          monday: null,
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: null,
          sunday: null,
        },
        EMPTY_BUSINESS_HOURS,
      ),
    ).toThrow(ResourceNoWorkingHoursError);
    expect(resource.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });

  it('updates name, turnoverMinutes, and maxCapacity', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      maxCapacity: 5,
    });

    resource.update(
      'Estúdio 2',
      ResourceType.ROOM,
      null,
      resource.workingHours,
      15,
      10,
      FULL_WEEK_BUSINESS_HOURS,
    );

    expect(resource.name).toBe('Estúdio 2');
    expect(resource.turnoverMinutes).toBe(15);
    expect(resource.maxCapacity).toBe(10);
  });

  it('corrects a mistaken type from ROOM to EQUIPMENT', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    resource.update(
      resource.name,
      ResourceType.EQUIPMENT,
      null,
      resource.workingHours,
      resource.turnoverMinutes,
      resource.maxCapacity,
      FULL_WEEK_BUSINESS_HOURS,
    );

    expect(resource.type).toBe(ResourceType.EQUIPMENT);
  });

  it('clears maxCapacity and sets refId when changing type to STAFF', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      maxCapacity: 5,
    });

    resource.update(
      'Camila Duarte',
      ResourceType.STAFF,
      STAFF_ID,
      resource.workingHours,
      resource.turnoverMinutes,
      null,
      FULL_WEEK_BUSINESS_HOURS,
    );

    expect(resource.type).toBe(ResourceType.STAFF);
    expect(resource.refId).toBe(STAFF_ID);
    expect(resource.maxCapacity).toBeNull();
  });

  it('rejects changing type away from STAFF while a refId is still set (STAFF/refId pairing)', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.STAFF,
      name: 'Camila Duarte',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      refId: STAFF_ID,
    });

    expect(() =>
      resource.update(
        resource.name,
        ResourceType.ROOM,
        STAFF_ID,
        resource.workingHours,
        resource.turnoverMinutes,
        resource.maxCapacity,
        FULL_WEEK_BUSINESS_HOURS,
      ),
    ).toThrow(ResourceTypeRefIdMismatchError);
  });

  it('rejects changing type to LOCATION', () => {
    // update()'s own LOCATION guard covers both directions uniformly — this is a different
    // call path from CreateResourceUseCase's explicit ResourceTypeNotCreatableError check,
    // which never runs during an update.
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    expect(() =>
      resource.update(
        resource.name,
        ResourceType.LOCATION,
        null,
        resource.workingHours,
        resource.turnoverMinutes,
        resource.maxCapacity,
        FULL_WEEK_BUSINESS_HOURS,
      ),
    ).toThrow(ResourceLocationTypeImmutableError);
  });

  it('rejects changing a LOCATION resource away from type=LOCATION', () => {
    const location = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.LOCATION,
      name: 'Lava Car BH (unidade única)',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    expect(() =>
      location.update(
        location.name,
        ResourceType.ROOM,
        null,
        location.workingHours,
        location.turnoverMinutes,
        location.maxCapacity,
        FULL_WEEK_BUSINESS_HOURS,
      ),
    ).toThrow(ResourceLocationTypeImmutableError);
    expect(location.type).toBe(ResourceType.LOCATION);
  });

  it('allows updating a LOCATION resource’s other fields when type is not changing', () => {
    const location = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.LOCATION,
      name: 'Lava Car BH (unidade única)',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    location.update(
      'Lava Car BH — Unidade Centro',
      ResourceType.LOCATION,
      null,
      location.workingHours,
      location.turnoverMinutes,
      location.maxCapacity,
      FULL_WEEK_BUSINESS_HOURS,
    );

    expect(location.name).toBe('Lava Car BH — Unidade Centro');
  });

  it('rejects setting a custom workingHours schedule on a LOCATION resource', () => {
    const location = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.LOCATION,
      name: 'Lava Car BH (unidade única)',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });
    const customHours: ResourceWorkingHours = {
      monday: { open: '10:00', close: '16:00' },
      tuesday: null,
      wednesday: null,
      thursday: null,
      friday: null,
      saturday: null,
      sunday: null,
    };

    expect(() =>
      location.update(
        location.name,
        ResourceType.LOCATION,
        null,
        customHours,
        location.turnoverMinutes,
        location.maxCapacity,
        FULL_WEEK_BUSINESS_HOURS,
      ),
    ).toThrow(ResourceLocationWorkingHoursImmutableError);
    expect(location.workingHours).toBeNull();
  });

  it('allows re-saving workingHours: null on a LOCATION resource (no-op, still inherits)', () => {
    const location = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.LOCATION,
      name: 'Lava Car BH (unidade única)',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    location.update(
      location.name,
      ResourceType.LOCATION,
      null,
      null,
      location.turnoverMinutes,
      location.maxCapacity,
      FULL_WEEK_BUSINESS_HOURS,
    );

    expect(location.workingHours).toBeNull();
  });
});

describe('Resource.deactivate() / reactivate()', () => {
  it('deactivates an active resource', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });
    resource.deactivate();
    expect(resource.isActive).toBe(false);
  });

  it('rejects deactivating a LOCATION resource', () => {
    // Resource.create() itself has no LOCATION guard (that lives in CreateResourceUseCase,
    // which is the only place a caller can reach type=LOCATION from) — constructing one
    // directly here is how a real LOCATION row (created only by the M21-S02 backfill
    // migration, then reconstitute()'d) is represented for this test.
    const location = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.LOCATION,
      name: 'Lava Car BH (unidade única)',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    expect(() => location.deactivate()).toThrow(ResourceLocationCannotBeDeactivatedError);
    expect(location.isActive).toBe(true);
  });

  it('reactivates an inactive resource', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });
    resource.deactivate();
    resource.reactivate();
    expect(resource.isActive).toBe(true);
  });

  it('throws when reactivating an already-active resource', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });
    expect(() => resource.reactivate()).toThrow(ResourceAlreadyActiveError);
  });
});

describe('Resource.reconstitute()', () => {
  it('does not let a caller mutate stored state through the reconstituted props object', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const props = {
      id: '00000000-0000-7000-8000-000000000003',
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      refId: null,
      name: 'Estúdio 1',
      workingHours: {
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
      turnoverMinutes: 0,
      maxCapacity: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    const resource = Resource.reconstitute(props);
    if (props.workingHours.monday) props.workingHours.monday.open = '00:00';

    expect(resource.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });
});
