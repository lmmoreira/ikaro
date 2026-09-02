import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { TenantProvisionedEventBuilder } from '../../../../test/builders/platform';
import { ResourceType } from '../../domain/resource.types';
import { CreateTenantLocationResourceUseCase } from '../../application/use-cases/create-tenant-location-resource.use-case';
import { TenantProvisionedHandler } from './tenant-provisioned.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';
const CORRELATION_ID = 'corr-booking-handler-test';

function makeHandler(): {
  handler: TenantProvisionedHandler;
  repo: InMemoryResourceRepository;
  eventBus: InMemoryEventBus;
} {
  const eventBus = new InMemoryEventBus();
  const repo = new InMemoryResourceRepository();
  const platform = new InMemoryBookingPlatformPort();
  const inboxRepo = new InMemoryInboxRepository();
  const useCase = new CreateTenantLocationResourceUseCase(
    repo,
    platform,
    inboxRepo,
    new InMemoryTransactionManager(),
  );
  const handler = new TenantProvisionedHandler(useCase, eventBus);
  return { handler, repo, eventBus };
}

describe('TenantProvisionedHandler (booking)', () => {
  it('delegates to CreateTenantLocationResourceUseCase and creates a LOCATION resource', async () => {
    const { handler, repo } = makeHandler();

    await handler.handle(
      new TenantProvisionedEventBuilder()
        .withTenantId(TENANT_ID)
        .withCorrelationId(CORRELATION_ID)
        .withName('Lava Car')
        .withSlug('lavacar')
        .withAdminEmail('admin@lavacar.com.br')
        .build(),
    );

    const resources = await repo.findByTenant(TENANT_ID, { type: ResourceType.LOCATION });
    expect(resources).toHaveLength(1);
    expect(resources[0].isActive).toBe(true);
  });

  it('is idempotent via use case: second call with same tenant creates exactly one LOCATION resource', async () => {
    const { handler, repo } = makeHandler();

    const event = new TenantProvisionedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .withName('Lava Car')
      .withSlug('lavacar')
      .withAdminEmail('admin@lavacar.com.br')
      .build();
    await handler.handle(event);
    await handler.handle(event);

    const resources = await repo.findByTenant(TENANT_ID, { type: ResourceType.LOCATION });
    expect(resources).toHaveLength(1);
  });

  it('calls execute() exactly once and rethrows on failure so Pub/Sub can nack and retry', async () => {
    const { handler } = makeHandler();
    const useCase = (
      handler as unknown as { createTenantLocationResource: CreateTenantLocationResourceUseCase }
    ).createTenantLocationResource;
    const executeSpy = jest.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('boom'));

    const event = new TenantProvisionedEventBuilder()
      .withTenantId(TENANT_ID)
      .withCorrelationId(CORRELATION_ID)
      .withName('Lava Car')
      .withSlug('lavacar')
      .withAdminEmail('admin@lavacar.com.br')
      .build();

    await expect(handler.handle(event)).rejects.toThrow('boom');
    expect(executeSpy).toHaveBeenCalledTimes(1);
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
