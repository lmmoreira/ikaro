import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { ResourceType } from '../../domain/resource.types';
import { CascadeStaffDeactivationUseCase } from './cascade-staff-deactivation.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '99999999-0000-7000-8000-000000000099';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';
const EVENT_ID = '00000000-0000-7000-8000-000000000003';
const CORRELATION_ID = '00000000-0000-7000-8000-000000000004';

describe('CascadeStaffDeactivationUseCase', () => {
  let repo: InMemoryResourceRepository;
  let inboxRepo: InMemoryInboxRepository;
  let tenantLock: InMemoryTenantLock;
  let useCase: CascadeStaffDeactivationUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    inboxRepo = new InMemoryInboxRepository();
    tenantLock = new InMemoryTenantLock();
    useCase = new CascadeStaffDeactivationUseCase(
      repo,
      inboxRepo,
      new InMemoryTransactionManager(),
      tenantLock,
    );
  });

  it('deactivates the Resource wrapping the deactivated staff member', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(resource);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      staffId: STAFF_ID,
      eventId: EVENT_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.cascaded).toBe(true);
    const stored = await repo.findById(resource.id, TENANT_ID);
    expect(stored!.isActive).toBe(false);
  });

  it('no-ops when no Resource wraps the deactivated staff member', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_ID,
      staffId: STAFF_ID,
      eventId: EVENT_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.cascaded).toBe(false);
  });

  it('is idempotent — a redelivered event is skipped', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(resource);

    await useCase.execute({
      tenantId: TENANT_ID,
      staffId: STAFF_ID,
      eventId: EVENT_ID,
      correlationId: CORRELATION_ID,
    });

    // Simulate an external reactivation between deliveries, then redeliver the same event —
    // the inbox check must short-circuit before re-deactivating.
    const reactivated = (await repo.findById(resource.id, TENANT_ID))!;
    reactivated.reactivate();
    await repo.save(reactivated);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      staffId: STAFF_ID,
      eventId: EVENT_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.cascaded).toBe(false);
    const stored = await repo.findById(resource.id, TENANT_ID);
    expect(stored!.isActive).toBe(true);
  });

  it('does not cascade to a same-staffId Resource wrapped in another tenant', async () => {
    const otherTenantResource = new ResourceBuilder()
      .withTenantId(OTHER_TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(otherTenantResource);

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      staffId: STAFF_ID,
      eventId: EVENT_ID,
      correlationId: CORRELATION_ID,
    });

    expect(result.cascaded).toBe(false);
    const stored = await repo.findById(otherTenantResource.id, OTHER_TENANT_ID);
    expect(stored!.isActive).toBe(true);
  });

  it('acquires lockTenantStaff before the findByRefId lookup, inside the same transaction as the eventual save', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(resource);
    const lockSpy = jest.spyOn(tenantLock, 'lockTenantStaff');
    const findByRefIdSpy = jest.spyOn(repo, 'findByRefId');

    await useCase.execute({
      tenantId: TENANT_ID,
      staffId: STAFF_ID,
      eventId: EVENT_ID,
      correlationId: CORRELATION_ID,
    });

    expect(lockSpy).toHaveBeenCalledWith(TENANT_ID, STAFF_ID);
    expect(lockSpy.mock.invocationCallOrder[0]).toBeLessThan(
      findByRefIdSpy.mock.invocationCallOrder[0],
    );
  });
});
