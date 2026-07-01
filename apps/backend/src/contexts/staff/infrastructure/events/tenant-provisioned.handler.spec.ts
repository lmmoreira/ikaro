import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { TenantProvisionedEventBuilder } from '../../../../test/builders/platform';
import { CreateInitialManagerUseCase } from '../../application/use-cases/create-initial-manager.use-case';
import { TenantProvisionedHandler } from './tenant-provisioned.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CORRELATION_ID = 'corr-handler-test';

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

    await handler.handle(
      new TenantProvisionedEventBuilder()
        .withTenantId(TENANT_ID)
        .withCorrelationId(CORRELATION_ID)
        .withName('Lava Car')
        .withSlug('lavacar')
        .withAdminEmail('admin@lavacar.com.br')
        .build(),
    );

    const staff = await repo.findByTenantAndEmail(TENANT_ID, 'admin@lavacar.com.br');
    expect(staff).not.toBeNull();
    expect(staff!.role).toBe('MANAGER');
    expect(staff!.isActive).toBe(true);

    expect(eventBus.published).toHaveLength(1);
    expect(eventBus.published[0].eventName).toBe('StaffInvited');
  });

  it('is idempotent via use case: second call with same tenant+email does nothing', async () => {
    const { handler, repo, eventBus } = makeHandler();

    const event = new TenantProvisionedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .withName('Lava Car')
      .withSlug('lavacar')
      .withAdminEmail('admin@lavacar.com.br')
      .build();
    await handler.handle(event);
    await handler.handle(event);

    const all = await repo.findAllByTenant(TENANT_ID, { limit: 100, offset: 0 });
    expect(all.total).toBe(1);
    expect(eventBus.published).toHaveLength(1);
  });

  it('rethrows use case errors so Pub/Sub can nack and retry', async () => {
    const { handler, eventBus } = makeHandler();
    const brokenEvent = new TenantProvisionedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .withName('X')
      .withSlug('x')
      .withAdminEmail('not-an-email')
      .build();

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
