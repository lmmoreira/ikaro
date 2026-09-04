import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import {
  ResourceAlreadyActiveError,
  ResourceNotFoundError,
  ResourceStaffNotFoundError,
} from '../../domain/errors/resource.error';
import { ResourceType } from '../../domain/resource.types';
import { ReactivateResourceUseCase } from './reactivate-resource.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '99999999-0000-7000-8000-000000000099';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';

describe('ReactivateResourceUseCase', () => {
  let repo: InMemoryResourceRepository;
  let staffPort: InMemoryBookingStaffPort;
  let tenantLock: InMemoryTenantLock;
  let useCase: ReactivateResourceUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    staffPort = new InMemoryBookingStaffPort();
    tenantLock = new InMemoryTenantLock();
    useCase = new ReactivateResourceUseCase(
      repo,
      staffPort,
      new InMemoryTransactionManager(),
      tenantLock,
    );
  });

  it('reactivates an inactive resource', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    resource.deactivate();
    await repo.save(resource);

    const result = await useCase.execute({ id: resource.id, tenantId: TENANT_ID });

    expect(result.isActive).toBe(true);
    const stored = await repo.findById(resource.id, TENANT_ID);
    expect(stored!.isActive).toBe(true);
  });

  it('reactivates a STAFF resource when the staff member is active', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    resource.deactivate();
    await repo.save(resource);
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });

    const result = await useCase.execute({ id: resource.id, tenantId: TENANT_ID });

    expect(result.isActive).toBe(true);
  });

  it('throws ResourceStaffNotFoundError when reactivating a STAFF resource whose staff member is still inactive', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    resource.deactivate();
    await repo.save(resource);
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: false });

    await expect(useCase.execute({ id: resource.id, tenantId: TENANT_ID })).rejects.toThrow(
      ResourceStaffNotFoundError,
    );
    const stored = await repo.findById(resource.id, TENANT_ID);
    expect(stored!.isActive).toBe(false);
  });

  it('throws ResourceAlreadyActiveError on an already-active resource', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    await repo.save(resource);

    await expect(useCase.execute({ id: resource.id, tenantId: TENANT_ID })).rejects.toThrow(
      ResourceAlreadyActiveError,
    );
  });

  it('throws ResourceNotFoundError when the resource does not exist', async () => {
    await expect(
      useCase.execute({ id: '00000000-0000-4000-8000-000000000099', tenantId: TENANT_ID }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('throws ResourceNotFoundError for a cross-tenant resource id and leaves it inactive', async () => {
    const resource = new ResourceBuilder().withTenantId(OTHER_TENANT_ID).build();
    resource.deactivate();
    await repo.save(resource);

    await expect(useCase.execute({ id: resource.id, tenantId: TENANT_ID })).rejects.toThrow(
      ResourceNotFoundError,
    );
    const stored = await repo.findById(resource.id, OTHER_TENANT_ID);
    expect(stored!.isActive).toBe(false);
  });

  describe('tenant-staff advisory lock (M21-S06)', () => {
    it('acquires lockTenantStaff before the in-transaction re-check when reactivating a STAFF resource', async () => {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.STAFF)
        .withRefId(STAFF_ID)
        .build();
      resource.deactivate();
      await repo.save(resource);
      staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
      const lockSpy = jest.spyOn(tenantLock, 'lockTenantStaff');

      await useCase.execute({ id: resource.id, tenantId: TENANT_ID });

      expect(lockSpy).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
    });

    it('does not acquire the lock when reactivating a non-STAFF resource', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      resource.deactivate();
      await repo.save(resource);
      const lockSpy = jest.spyOn(tenantLock, 'lockTenantStaff');

      await useCase.execute({ id: resource.id, tenantId: TENANT_ID });

      expect(lockSpy).not.toHaveBeenCalled();
    });
  });
});
