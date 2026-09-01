import {
  EMPTY_BUSINESS_HOURS,
  FULL_WEEK_BUSINESS_HOURS,
} from '../../../test/utils/business-hours-fixtures';
import {
  ResourceAlreadyActiveError,
  ResourceMaxCapacityInvalidError,
  ResourceNoWorkingHoursError,
  ResourceTypeRefIdMismatchError,
  ResourceWorkingHoursOutsideTenantHoursError,
} from './errors/resource.error';
import { Resource } from './resource.aggregate';
import { ResourceType } from './resource.types';

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
});

describe('Resource.updateWorkingHours()', () => {
  it('updates working hours when valid', () => {
    const resource = Resource.create({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });
    resource.updateWorkingHours(
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
    resource.updateWorkingHours(null, FULL_WEEK_BUSINESS_HOURS);
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
      resource.updateWorkingHours(
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

    expect(() => resource.updateWorkingHours(null, EMPTY_BUSINESS_HOURS)).toThrow(
      ResourceNoWorkingHoursError,
    );
    // Rejected update must not have mutated the existing, valid working hours.
    expect(resource.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
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
