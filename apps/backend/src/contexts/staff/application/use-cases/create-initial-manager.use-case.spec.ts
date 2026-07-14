import { SYSTEM_ACTOR_ID } from '../../../../shared/domain/system-actor';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { StaffBuilder } from '../../../../test/builders/staff';
import { StaffInvited } from '../../domain/events/staff-invited.event';
import { CreateInitialManagerUseCase } from './create-initial-manager.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const ADMIN_EMAIL = 'admin@lavacar.com.br';
const CORRELATION_ID = 'corr-create-initial';
const EVENT_ID = 'event-tenant-provisioned-1';

const baseDto = {
  tenantId: TENANT_ID,
  eventId: EVENT_ID,
  adminEmail: ADMIN_EMAIL,
  correlationId: CORRELATION_ID,
};

describe('CreateInitialManagerUseCase', () => {
  let repo: InMemoryStaffRepository;
  let eventBus: InMemoryEventBus;
  let inboxRepo: InMemoryInboxRepository;
  let useCase: CreateInitialManagerUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    repo = new InMemoryStaffRepository(eventBus);
    inboxRepo = new InMemoryInboxRepository();
    useCase = new CreateInitialManagerUseCase(repo, inboxRepo, new InMemoryTransactionManager());
  });

  it('creates active MANAGER staff and publishes StaffInvited', async () => {
    const result = await useCase.execute(baseDto);

    expect(result.staffId).toBeDefined();

    const saved = await repo.findByTenantAndEmail(TENANT_ID, ADMIN_EMAIL);
    expect(saved).not.toBeNull();
    expect(saved!.role).toBe('MANAGER');
    expect(saved!.isActive).toBe(true);
    expect(saved!.googleOAuthId).toBeNull();
    expect(saved!.name).toBeNull();
    expect(saved!.invitedBy).toBe(SYSTEM_ACTOR_ID);
    expect(saved!.tenantId).toBe(TENANT_ID);

    expect(eventBus.published).toHaveLength(1);
    const event = eventBus.published[0] as StaffInvited;
    expect(event.eventName).toBe('StaffInvited');
    expect(event.data.staffId).toBe(result.staffId);
    expect(event.tenantId).toBe(TENANT_ID);
    expect(event.correlationId).toBe(CORRELATION_ID);
  });

  it('marks the TenantProvisioned event processed in the inbox (TD24-S04 coverage)', async () => {
    await useCase.execute(baseDto);

    expect(
      await inboxRepo.hasBeenProcessed(EVENT_ID, CreateInitialManagerUseCase.CONSUMER_NAME),
    ).toBe(true);
  });

  it('redelivery: a second execute() with the same eventId creates exactly one manager and one inbox record', async () => {
    const first = await useCase.execute(baseDto);
    const second = await useCase.execute(baseDto);

    expect(second.staffId).toBe(first.staffId);
    expect(eventBus.published).toHaveLength(1);

    const all = await repo.findAllByTenant(TENANT_ID, { limit: 100, offset: 0 });
    expect(all.total).toBe(1);

    expect(
      await inboxRepo.hasBeenProcessed(EVENT_ID, CreateInitialManagerUseCase.CONSUMER_NAME),
    ).toBe(true);
  });

  it('is idempotent: returns existing staffId when staff already exists', async () => {
    const existing = new StaffBuilder().withTenantId(TENANT_ID).withEmail(ADMIN_EMAIL).build();
    await repo.save(existing);

    const result = await useCase.execute(baseDto);

    expect(result.staffId).toBe(existing.id);
    expect(eventBus.published).toHaveLength(0);

    const all = await repo.findAllByTenant(TENANT_ID, { limit: 100, offset: 0 });
    expect(all.total).toBe(1);
  });

  it('propagates correlationId to the StaffInvited event', async () => {
    await useCase.execute(baseDto);
    expect((eventBus.published[0] as StaffInvited).correlationId).toBe(CORRELATION_ID);
  });

  it('tenant isolation: creates staff with correct tenantId', async () => {
    await useCase.execute(baseDto);
    const saved = await repo.findByTenantAndEmail(TENANT_ID, ADMIN_EMAIL);
    expect(saved!.tenantId).toBe(TENANT_ID);
  });
});
