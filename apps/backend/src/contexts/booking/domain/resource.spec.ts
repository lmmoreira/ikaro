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
    const resource = Resource.create(
      TENANT_ID,
      ResourceType.ROOM,
      'Estúdio 1',
      FULL_WEEK_BUSINESS_HOURS,
    );

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
    const resource = Resource.create(
      TENANT_ID,
      ResourceType.STAFF,
      'Camila Duarte',
      FULL_WEEK_BUSINESS_HOURS,
      null,
      STAFF_ID,
    );

    expect(resource.type).toBe(ResourceType.STAFF);
    expect(resource.refId).toBe(STAFF_ID);
  });

  it('rejects type=STAFF with no refId', () => {
    expect(() =>
      Resource.create(TENANT_ID, ResourceType.STAFF, 'Camila Duarte', FULL_WEEK_BUSINESS_HOURS),
    ).toThrow(ResourceTypeRefIdMismatchError);
  });

  it('rejects a non-STAFF type with a refId set', () => {
    expect(() =>
      Resource.create(
        TENANT_ID,
        ResourceType.ROOM,
        'Estúdio 1',
        FULL_WEEK_BUSINESS_HOURS,
        null,
        STAFF_ID,
      ),
    ).toThrow(ResourceTypeRefIdMismatchError);
  });

  it('rejects maxCapacity <= 0', () => {
    expect(() =>
      Resource.create(
        TENANT_ID,
        ResourceType.ROOM,
        'Estúdio 1',
        FULL_WEEK_BUSINESS_HOURS,
        null,
        null,
        0,
      ),
    ).toThrow(ResourceMaxCapacityInvalidError);
  });

  it('accepts maxCapacity > 0', () => {
    const resource = Resource.create(
      TENANT_ID,
      ResourceType.ROOM,
      'Estúdio 1',
      FULL_WEEK_BUSINESS_HOURS,
      null,
      null,
      12,
    );
    expect(resource.maxCapacity).toBe(12);
  });

  it('rejects a workingHours window outside the tenant business hours', () => {
    expect(() =>
      Resource.create(TENANT_ID, ResourceType.ROOM, 'Estúdio 1', FULL_WEEK_BUSINESS_HOURS, {
        monday: { open: '08:00', close: '18:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      }),
    ).toThrow(ResourceWorkingHoursOutsideTenantHoursError);
  });

  it('rejects a workingHours day the tenant is fully closed on', () => {
    expect(() =>
      Resource.create(TENANT_ID, ResourceType.ROOM, 'Estúdio 1', FULL_WEEK_BUSINESS_HOURS, {
        monday: null,
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: { open: '09:00', close: '12:00' },
        sunday: null,
      }),
    ).toThrow(ResourceWorkingHoursOutsideTenantHoursError);
  });

  it('accepts a workingHours window that is a subset of tenant hours', () => {
    const resource = Resource.create(
      TENANT_ID,
      ResourceType.ROOM,
      'Estúdio 1',
      FULL_WEEK_BUSINESS_HOURS,
      {
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
    );
    expect(resource.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });

  it('rejects no working hours when tenant also has none', () => {
    expect(() =>
      Resource.create(TENANT_ID, ResourceType.ROOM, 'Estúdio 1', EMPTY_BUSINESS_HOURS),
    ).toThrow(ResourceNoWorkingHoursError);
  });
});

describe('Resource.updateWorkingHours()', () => {
  it('updates working hours when valid', () => {
    const resource = Resource.create(
      TENANT_ID,
      ResourceType.ROOM,
      'Estúdio 1',
      FULL_WEEK_BUSINESS_HOURS,
    );
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
    const resource = Resource.create(
      TENANT_ID,
      ResourceType.ROOM,
      'Estúdio 1',
      FULL_WEEK_BUSINESS_HOURS,
      {
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
    );
    resource.updateWorkingHours(null, FULL_WEEK_BUSINESS_HOURS);
    expect(resource.workingHours).toBeNull();
  });

  it('rejects an outside-tenant-hours update', () => {
    const resource = Resource.create(
      TENANT_ID,
      ResourceType.ROOM,
      'Estúdio 1',
      FULL_WEEK_BUSINESS_HOURS,
    );
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
});

describe('Resource.deactivate() / reactivate()', () => {
  it('deactivates an active resource', () => {
    const resource = Resource.create(
      TENANT_ID,
      ResourceType.ROOM,
      'Estúdio 1',
      FULL_WEEK_BUSINESS_HOURS,
    );
    resource.deactivate();
    expect(resource.isActive).toBe(false);
  });

  it('reactivates an inactive resource', () => {
    const resource = Resource.create(
      TENANT_ID,
      ResourceType.ROOM,
      'Estúdio 1',
      FULL_WEEK_BUSINESS_HOURS,
    );
    resource.deactivate();
    resource.reactivate();
    expect(resource.isActive).toBe(true);
  });

  it('throws when reactivating an already-active resource', () => {
    const resource = Resource.create(
      TENANT_ID,
      ResourceType.ROOM,
      'Estúdio 1',
      FULL_WEEK_BUSINESS_HOURS,
    );
    expect(() => resource.reactivate()).toThrow(ResourceAlreadyActiveError);
  });
});
