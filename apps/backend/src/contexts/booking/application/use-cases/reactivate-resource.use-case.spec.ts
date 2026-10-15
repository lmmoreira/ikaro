import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryFutureCommitmentExceptionRepository } from '../../../../test/repositories/booking/in-memory-future-commitment-exception.repository';
import {
  FutureCommitmentExceptionBuilder,
  ResourceBuilder,
} from '../../../../test/builders/booking/index';
import { Envelope } from '../../../../shared/domain/envelope';
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
const MANAGER_ID = '00000000-0000-7000-8000-000000000003';
const CORRELATION_ID = 'corr-reactivate';

describe('ReactivateResourceUseCase', () => {
  let repo: InMemoryResourceRepository;
  let staffPort: InMemoryBookingStaffPort;
  let tenantLock: InMemoryTenantLock;
  let exceptionRepo: InMemoryFutureCommitmentExceptionRepository;
  let published: Envelope[];
  let useCase: ReactivateResourceUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    staffPort = new InMemoryBookingStaffPort();
    tenantLock = new InMemoryTenantLock();
    published = [];
    exceptionRepo = new InMemoryFutureCommitmentExceptionRepository({
      publish: async (event) => {
        published.push(event);
      },
    });
    useCase = new ReactivateResourceUseCase(
      repo,
      staffPort,
      new InMemoryTransactionManager(),
      tenantLock,
      exceptionRepo,
    );
  });

  const run = (id: string, tenantId = TENANT_ID) =>
    useCase.execute({ id, tenantId, staffId: MANAGER_ID, correlationId: CORRELATION_ID });

  it('reactivates an inactive resource', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    resource.deactivate();
    await repo.save(resource);

    const result = await run(resource.id);

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

    const result = await run(resource.id);

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

    await expect(run(resource.id)).rejects.toThrow(ResourceStaffNotFoundError);
    const stored = await repo.findById(resource.id, TENANT_ID);
    expect(stored!.isActive).toBe(false);
  });

  it('throws ResourceAlreadyActiveError on an already-active resource', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    await repo.save(resource);

    await expect(run(resource.id)).rejects.toThrow(ResourceAlreadyActiveError);
  });

  it('throws ResourceNotFoundError when the resource does not exist', async () => {
    await expect(run('00000000-0000-4000-8000-000000000099')).rejects.toThrow(
      ResourceNotFoundError,
    );
  });

  it('throws ResourceNotFoundError for a cross-tenant resource id and leaves it inactive', async () => {
    const resource = new ResourceBuilder().withTenantId(OTHER_TENANT_ID).build();
    resource.deactivate();
    await repo.save(resource);

    await expect(run(resource.id)).rejects.toThrow(ResourceNotFoundError);
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

      await run(resource.id);

      expect(lockSpy).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
    });

    it('does not acquire the lock when reactivating a non-STAFF resource', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      resource.deactivate();
      await repo.save(resource);
      const lockSpy = jest.spyOn(tenantLock, 'lockTenantStaff');

      await run(resource.id);

      expect(lockSpy).not.toHaveBeenCalled();
    });

    it('rejects the reactivation when the staff member is deactivated exactly at lock-acquisition time, even though the fast pre-check passed', async () => {
      const resource = new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.STAFF)
        .withRefId(STAFF_ID)
        .build();
      resource.deactivate();
      await repo.save(resource);
      staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
      jest.spyOn(tenantLock, 'lockTenantStaff').mockImplementation(async () => {
        // Simulates a concurrent StaffDeactivated cascade committing and releasing the lock
        // exactly as this call acquires it — proving the re-check under the lock is genuinely
        // authoritative, not just present.
        staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: false });
      });
      const saveSpy = jest.spyOn(repo, 'save');

      await expect(run(resource.id)).rejects.toThrow(ResourceStaffNotFoundError);
      // InMemoryResourceRepository.findById() returns a live reference, so the pre-lock
      // reactivate() call visibly mutates the stored object regardless of what happens next —
      // the real TypeORM-backed repository has no such effect until save() actually runs, which
      // never happens here. Assert on save() never being called, the behavior that actually
      // matters, rather than on the in-memory double's reference-sharing artifact.
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });
  describe('closing the deactivation worklist entries (M23-S45)', () => {
    const seedInactive = async (type: ResourceType = ResourceType.ROOM) => {
      const builder = new ResourceBuilder().withTenantId(TENANT_ID);
      if (type === ResourceType.STAFF) builder.withType(ResourceType.STAFF).withRefId(STAFF_ID);
      const resource = builder.build();
      resource.deactivate();
      await repo.save(resource);
      return resource;
    };
    const seedEntry = (resourceId: string, tenantId = TENANT_ID) => {
      const entry = new FutureCommitmentExceptionBuilder()
        .withTenantId(tenantId)
        .withSourceId(resourceId)
        .build();
      // A loaded entry carries no pending events, unlike a freshly raised one.
      entry.clearDomainEvents();
      exceptionRepo.seed(entry);
      return entry;
    };

    it('dismisses every OPEN entry of the resource with the reactivating manager and reason RESOURCE_REACTIVATED', async () => {
      const resource = await seedInactive();
      const first = seedEntry(resource.id);
      const second = seedEntry(resource.id);

      await run(resource.id);

      for (const entry of [first, second]) {
        const stored = (await exceptionRepo.findById(entry.id, TENANT_ID))!;
        expect(stored.status).toBe('DISMISSED');
        expect(stored.resolutionReason).toBe('RESOURCE_REACTIVATED');
        expect(stored.resolvedByStaffId).toBe(MANAGER_ID);
      }
      const dismissed = published.filter(
        (e) => e.eventName === 'FutureCommitmentExceptionDismissed',
      );
      expect(dismissed).toHaveLength(2);
      expect(dismissed.every((e) => e.correlationId === CORRELATION_ID)).toBe(true);
    });

    it('does not touch an already RESOLVED or DISMISSED entry and publishes no event for it', async () => {
      const resource = await seedInactive();
      const resolved = seedEntry(resource.id);
      resolved.resolve(STAFF_ID, 'CANCEL', null, 'corr-earlier');
      const dismissedBefore = seedEntry(resource.id);
      dismissedBefore.dismiss(STAFF_ID, 'Already handled', 'corr-earlier');
      const resolvedAt = resolved.resolvedAt;
      const dismissedAt = dismissedBefore.resolvedAt;
      resolved.clearDomainEvents();
      dismissedBefore.clearDomainEvents();

      await run(resource.id);

      expect(resolved.status).toBe('RESOLVED');
      expect(resolved.resolutionReason).toBeNull();
      expect(resolved.resolvedAt).toEqual(resolvedAt);
      expect(dismissedBefore.resolutionReason).toBe('Already handled');
      expect(dismissedBefore.resolvedAt).toEqual(dismissedAt);
      expect(published).toHaveLength(0);
    });

    it("leaves another resource's entries OPEN", async () => {
      const resource = await seedInactive();
      const other = await seedInactive();
      const otherEntry = seedEntry(other.id);

      await run(resource.id);

      expect(otherEntry.status).toBe('OPEN');
    });

    it("never closes another tenant's entries", async () => {
      const resource = await seedInactive();
      const otherTenantEntry = seedEntry(resource.id, OTHER_TENANT_ID);

      await run(resource.id);

      expect(otherTenantEntry.status).toBe('OPEN');
    });

    it('rejects a STAFF wrapper whose Staff row is inactive and closes nothing', async () => {
      const resource = await seedInactive(ResourceType.STAFF);
      staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: false });
      const entry = seedEntry(resource.id);

      await expect(run(resource.id)).rejects.toThrow(ResourceStaffNotFoundError);

      expect(entry.status).toBe('OPEN');
      expect(published).toHaveLength(0);
    });

    it('rejects the reactivation of an already-active resource and closes nothing', async () => {
      const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
      await repo.save(resource);
      const entry = seedEntry(resource.id);

      await expect(run(resource.id)).rejects.toThrow(ResourceAlreadyActiveError);

      expect(entry.status).toBe('OPEN');
    });

    it('reactivates normally when the resource has no OPEN entries', async () => {
      const resource = await seedInactive();

      const result = await run(resource.id);

      expect(result).toEqual({ id: resource.id, isActive: true });
      expect(published).toHaveLength(0);
    });

    it('takes the resource lock after the staff lock and before reading the entries, then saves the resource last', async () => {
      const resource = await seedInactive(ResourceType.STAFF);
      staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
      seedEntry(resource.id);
      const calls: string[] = [];
      jest.spyOn(tenantLock, 'lockTenantStaff').mockImplementation(async () => {
        calls.push('lockTenantStaff');
      });
      jest.spyOn(tenantLock, 'lockResources').mockImplementation(async (_tenantId, ids) => {
        calls.push(`lockResources:${ids.join(',')}`);
      });
      const readSpy = jest.spyOn(exceptionRepo, 'findOpenBySourceForUpdate');
      readSpy.mockImplementation(async (...args) => {
        calls.push('findOpenBySourceForUpdate');
        return InMemoryFutureCommitmentExceptionRepository.prototype.findOpenBySourceForUpdate.apply(
          exceptionRepo,
          args,
        );
      });
      jest.spyOn(exceptionRepo, 'save').mockImplementation(async () => {
        calls.push('saveEntry');
      });
      jest.spyOn(repo, 'save').mockImplementation(async () => {
        calls.push('saveResource');
      });

      await run(resource.id);

      expect(calls).toEqual([
        'lockTenantStaff',
        `lockResources:${resource.id}`,
        'findOpenBySourceForUpdate',
        'saveEntry',
        'saveResource',
      ]);
      expect(readSpy).toHaveBeenCalledWith(TENANT_ID, 'RESOURCE_DEACTIVATION', resource.id);
    });
  });
});
