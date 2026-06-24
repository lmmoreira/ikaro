import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { TenantProvisioned } from '../../../platform/domain/events/tenant-provisioned.event';
import { CreateInitialManagerUseCase } from '../../application/use-cases/create-initial-manager.use-case';
import { TenantProvisionedHandler } from './tenant-provisioned.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CORRELATION_ID = 'corr-handler-test';

function makeEvent(tenantId = TENANT_ID, adminEmail = 'admin@lavacar.com.br'): TenantProvisioned {
  return new TenantProvisioned(tenantId, CORRELATION_ID, {
    name: 'Lava Car',
    slug: 'lavacar',
    adminEmail,
    timezone: 'America/Sao_Paulo',
  });
}

function makeHandler(): {
  handler: TenantProvisionedHandler;
  repo: InMemoryStaffRepository;
  eventBus: InMemoryEventBus;
} {
  const repo = new InMemoryStaffRepository();
  const eventBus = new InMemoryEventBus();
  const useCase = new CreateInitialManagerUseCase(repo, new InMemoryTransactionManager(), eventBus);
  const handler = new TenantProvisionedHandler(useCase, eventBus);
  return { handler, repo, eventBus };
}

describe('TenantProvisionedHandler', () => {
  it('delegates to CreateInitialManagerUseCase and creates MANAGER staff', async () => {
    const { handler, repo, eventBus } = makeHandler();

    await handler.handle(makeEvent());

    const staff = await repo.findByTenantAndEmail(TENANT_ID, 'admin@lavacar.com.br');
    expect(staff).not.toBeNull();
    expect(staff!.role).toBe('MANAGER');
    expect(staff!.isActive).toBe(true);

    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('StaffInvited');
  });

  it('is idempotent via use case: second call with same tenant+email does nothing', async () => {
    const { handler, repo, eventBus } = makeHandler();

    await handler.handle(makeEvent());
    await handler.handle(makeEvent());

    const all = await repo.findAllByTenant(TENANT_ID, 100, 0);
    expect(all.total).toBe(1);
    expect(eventBus.published).toHaveLength(1);
  });

  it('rethrows use case errors so Pub/Sub can nack and retry', async () => {
    const { handler, eventBus } = makeHandler();
    const brokenEvent = new TenantProvisioned(TENANT_ID, CORRELATION_ID, {
      name: 'X',
      slug: 'x',
      adminEmail: 'not-an-email',
      timezone: 'America/Sao_Paulo',
    });

    await expect(handler.handle(brokenEvent)).rejects.toThrow();
    expect(eventBus.published).toHaveLength(0);
  });

  it('registers subscription on onModuleInit', () => {
    const { handler, eventBus } = makeHandler();
    const subscriptions: string[] = [];
    jest.spyOn(eventBus, 'subscribe').mockImplementation((eventName: string) => {
      subscriptions.push(eventName);
    });

    handler.onModuleInit();

    expect(subscriptions).toContain('TenantProvisioned');
  });
});
