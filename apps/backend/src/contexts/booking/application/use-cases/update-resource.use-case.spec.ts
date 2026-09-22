import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { FULL_WEEK_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import {
  ResourceLocationTypeImmutableError,
  ResourceLocationWorkingHoursImmutableError,
  ResourceNotFoundError,
  ResourceStaffAlreadyWrappedError,
  ResourceStaffNotFoundError,
  ResourceTypeRefIdMismatchError,
  ResourceWorkingHoursOutsideTenantHoursError,
} from '../../domain/errors/resource.error';
import { ResourceType } from '../../domain/resource.types';
import { StaffWrapValidationService } from '../services/staff-wrap-validation.service';
import { UpdateResourceUseCase } from './update-resource.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';
const OTHER_STAFF_ID = '00000000-0000-7000-8000-000000000003';

describe('UpdateResourceUseCase', () => {
  let repo: InMemoryResourceRepository;
  let staffPort: InMemoryBookingStaffPort;
  let tenantLock: InMemoryTenantLock;
  let useCase: UpdateResourceUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    staffPort = new InMemoryBookingStaffPort();
    tenantLock = new InMemoryTenantLock();
    const staffWrapValidation = new StaffWrapValidationService(staffPort, repo);
    useCase = new UpdateResourceUseCase(
      repo,
      staffWrapValidation,
      new InMemoryTransactionManager(),
      tenantLock,
    );
  });

  it('updates working hours for an existing resource', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    await repo.save(resource);

    const result = await useCase.execute({
      id: resource.id,
      tenantId: TENANT_ID,
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

    expect(result.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });

  it('updates name, turnoverMinutes, and maxCapacity without an explicit body, leaving other fields untouched', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withName('Estúdio 1')
      .withMaxCapacity(5)
      .build();
    await repo.save(resource);

    const result = await useCase.execute({
      id: resource.id,
      tenantId: TENANT_ID,
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      name: 'Estúdio 2',
      turnoverMinutes: 20,
      maxCapacity: 8,
    });

    expect(result.name).toBe('Estúdio 2');
    expect(result.turnoverMinutes).toBe(20);
    expect(result.maxCapacity).toBe(8);
    // type/workingHours were never sent — must remain exactly what they were.
    expect(result.type).toBe(resource.type);
  });

  it('sending an empty body leaves every field unchanged', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withName('Estúdio 1')
      .withMaxCapacity(5)
      .build();
    await repo.save(resource);

    const result = await useCase.execute({
      id: resource.id,
      tenantId: TENANT_ID,
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    expect(result.name).toBe('Estúdio 1');
    expect(result.maxCapacity).toBe(5);
  });

  it('corrects a mistaken type from ROOM to EQUIPMENT', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await repo.save(resource);

    const result = await useCase.execute({
      id: resource.id,
      tenantId: TENANT_ID,
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      type: ResourceType.EQUIPMENT,
    });

    expect(result.type).toBe(ResourceType.EQUIPMENT);
  });

  it('changes type to STAFF when the staff member is active and not already wrapped', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await repo.save(resource);
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });

    const result = await useCase.execute({
      id: resource.id,
      tenantId: TENANT_ID,
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      type: ResourceType.STAFF,
      refId: STAFF_ID,
    });

    expect(result.type).toBe(ResourceType.STAFF);
    expect(result.refId).toBe(STAFF_ID);
  });

  it('re-saving the same refId on the same STAFF resource does not self-conflict', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(resource);
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });

    const result = await useCase.execute({
      id: resource.id,
      tenantId: TENANT_ID,
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      name: 'Camila Duarte (atualizado)',
    });

    expect(result.refId).toBe(STAFF_ID);
  });

  it('edits an unrelated field on a STAFF resource whose wrapped staff member has since been deactivated', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(resource);
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: false });

    const result = await useCase.execute({
      id: resource.id,
      tenantId: TENANT_ID,
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      turnoverMinutes: 30,
    });

    expect(result.turnoverMinutes).toBe(30);
    expect(result.refId).toBe(STAFF_ID);
  });

  it('throws ResourceStaffAlreadyWrappedError when changing type to STAFF for a staff member already wrapped by a different resource', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await repo.save(resource);
    const existingWrap = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(existingWrap);
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });

    await expect(
      useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        type: ResourceType.STAFF,
        refId: STAFF_ID,
      }),
    ).rejects.toThrow(ResourceStaffAlreadyWrappedError);
  });

  it('throws ResourceStaffNotFoundError when changing type to STAFF for an inactive staff member', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await repo.save(resource);
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: false });

    await expect(
      useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        type: ResourceType.STAFF,
        refId: STAFF_ID,
      }),
    ).rejects.toThrow(ResourceStaffNotFoundError);
  });

  it('throws ResourceTypeRefIdMismatchError when changing type away from STAFF without clearing refId', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(resource);

    await expect(
      useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        type: ResourceType.ROOM,
      }),
    ).rejects.toThrow(ResourceTypeRefIdMismatchError);
  });

  it('clears refId when explicitly changing type away from STAFF', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(resource);

    const result = await useCase.execute({
      id: resource.id,
      tenantId: TENANT_ID,
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      type: ResourceType.ROOM,
      refId: null,
    });

    expect(result.type).toBe(ResourceType.ROOM);
    expect(result.refId).toBeNull();
  });

  it('changing refId to a different staff member re-validates the new one, ignoring the old', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(resource);
    staffPort.setProfile(OTHER_STAFF_ID, { id: OTHER_STAFF_ID, isActive: true });

    const result = await useCase.execute({
      id: resource.id,
      tenantId: TENANT_ID,
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      refId: OTHER_STAFF_ID,
    });

    expect(result.refId).toBe(OTHER_STAFF_ID);
  });

  it('throws ResourceLocationTypeImmutableError when changing type to LOCATION', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .build();
    await repo.save(resource);

    await expect(
      useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        type: ResourceType.LOCATION,
      }),
    ).rejects.toThrow(ResourceLocationTypeImmutableError);
  });

  it('throws ResourceLocationTypeImmutableError when changing a LOCATION resource away from type=LOCATION', async () => {
    const location = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.LOCATION)
      .build();
    await repo.save(location);

    await expect(
      useCase.execute({
        id: location.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        type: ResourceType.ROOM,
      }),
    ).rejects.toThrow(ResourceLocationTypeImmutableError);
  });

  it('allows renaming a LOCATION resource without touching its type', async () => {
    const location = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.LOCATION)
      .withName('Lava Car BH (unidade única)')
      .build();
    await repo.save(location);

    const result = await useCase.execute({
      id: location.id,
      tenantId: TENANT_ID,
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      name: 'Lava Car BH — Unidade Centro',
    });

    expect(result.name).toBe('Lava Car BH — Unidade Centro');
    expect(result.type).toBe(ResourceType.LOCATION);
  });

  it('throws ResourceLocationWorkingHoursImmutableError when setting a custom schedule on a LOCATION resource', async () => {
    const location = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.LOCATION)
      .build();
    await repo.save(location);

    await expect(
      useCase.execute({
        id: location.id,
        tenantId: TENANT_ID,
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
      }),
    ).rejects.toThrow(ResourceLocationWorkingHoursImmutableError);
  });

  it('throws ResourceNotFoundError when the resource does not exist', async () => {
    await expect(
      useCase.execute({
        id: '00000000-0000-4000-8000-000000000099',
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        workingHours: null,
      }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('throws ResourceNotFoundError for a cross-tenant resource id', async () => {
    const resource = new ResourceBuilder()
      .withTenantId('99999999-0000-7000-8000-000000000099')
      .build();
    await repo.save(resource);

    await expect(
      useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        workingHours: null,
      }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('rejects working hours outside the tenant business hours', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    await repo.save(resource);

    await expect(
      useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
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
    ).rejects.toThrow(ResourceWorkingHoursOutsideTenantHoursError);
  });

  describe('tenant-staff advisory lock (M21-S06)', () => {
    it('acquires lockTenantStaff before the in-transaction re-check when refId is actually changing to a STAFF wrap', async () => {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await repo.save(resource);
      staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
      const lockSpy = jest.spyOn(tenantLock, 'lockTenantStaff');

      await useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        type: ResourceType.STAFF,
        refId: STAFF_ID,
      });

      expect(lockSpy).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
    });

    it('rejects the update when the new staff wrap target is deactivated exactly at lock-acquisition time, even though the fast pre-check passed', async () => {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await repo.save(resource);
      staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
      jest.spyOn(tenantLock, 'lockTenantStaff').mockImplementation(async () => {
        // Simulates a concurrent StaffDeactivated cascade committing and releasing the lock
        // exactly as this call acquires it — proving the re-check under the lock is genuinely
        // authoritative, not just present.
        staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: false });
      });

      await expect(
        useCase.execute({
          id: resource.id,
          tenantId: TENANT_ID,
          tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
          type: ResourceType.STAFF,
          refId: STAFF_ID,
        }),
      ).rejects.toThrow(ResourceStaffNotFoundError);
      const stored = await repo.findById(resource.id, TENANT_ID);
      expect(stored!.type).toBe(ResourceType.ROOM);
    });

    // refId staying unchanged (resent explicitly, or simply omitted) still needs to coordinate
    // with a concurrent cascade for that same staff — unlike the "refId changing" case above, the
    // resource keeps representing the SAME staff member throughout this edit, so a concurrent
    // StaffDeactivated cascade's isActive write must not be silently clobbered.
    it('acquires the lock when editing an unrelated field on a STAFF resource whose wrap is unchanged', async () => {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.STAFF)
        .withRefId(STAFF_ID)
        .build();
      await repo.save(resource);
      staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
      const lockSpy = jest.spyOn(tenantLock, 'lockTenantStaff');

      await useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        name: 'Camila Duarte (atualizado)',
      });

      expect(lockSpy).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
    });

    it('does not clobber a concurrent cascade deactivation when editing an unrelated field on an unchanged STAFF wrap', async () => {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.STAFF)
        .withRefId(STAFF_ID)
        .build();
      await repo.save(resource);
      staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
      jest.spyOn(tenantLock, 'lockTenantStaff').mockImplementation(async () => {
        // Simulates CascadeStaffDeactivationUseCase committing and releasing the lock exactly as
        // this call acquires it — proving the fresh re-read under the lock preserves the
        // cascade's write instead of this call's own blind save clobbering it back to active.
        const cascaded = (await repo.findById(resource.id, TENANT_ID))!;
        cascaded.deactivate();
        await repo.save(cascaded);
      });

      const result = await useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        turnoverMinutes: 45,
      });

      expect(result.turnoverMinutes).toBe(45);
      expect(result.isActive).toBe(false);
      const stored = await repo.findById(resource.id, TENANT_ID);
      expect(stored!.isActive).toBe(false);
    });

    it('does not acquire the lock for an unrelated field edit on a non-STAFF resource', async () => {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .build();
      await repo.save(resource);
      const lockSpy = jest.spyOn(tenantLock, 'lockTenantStaff');

      await useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        turnoverMinutes: 15,
      });

      expect(lockSpy).not.toHaveBeenCalled();
    });
  });
});
