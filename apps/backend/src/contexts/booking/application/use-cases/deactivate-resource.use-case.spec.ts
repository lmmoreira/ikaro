import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import {
  FCE_OTHER_TENANT_ID,
  FCE_TENANT_ID as TENANT_ID,
  FutureCommitmentFixture,
} from '../../../../test/utils/future-commitment-fixture';
import { BookingStatus } from '../../domain/booking.aggregate';
import {
  ResourceLocationCannotBeDeactivatedError,
  ResourceNotFoundError,
} from '../../domain/errors/resource.error';
import { ResourceType } from '../../domain/resource.types';
import { DeactivateResourceUseCase } from './deactivate-resource.use-case';

const CORRELATION_ID = 'corr-deactivate-1';

describe('DeactivateResourceUseCase', () => {
  let world: FutureCommitmentFixture;
  let useCase: DeactivateResourceUseCase;

  beforeEach(() => {
    world = new FutureCommitmentFixture();
    useCase = new DeactivateResourceUseCase(
      world.resourceRepo,
      new InMemoryTransactionManager(),
      world.raise,
    );
  });

  it('deactivates an active resource', async () => {
    const resource = await world.addResource('Sala 1');

    await useCase.execute({ id: resource.id, tenantId: TENANT_ID, correlationId: CORRELATION_ID });

    const stored = await world.resourceRepo.findById(resource.id, TENANT_ID);
    expect(stored!.isActive).toBe(false);
  });

  it('raises nothing when the resource has no future bookings', async () => {
    const resource = await world.addResource('Sala 1');

    await useCase.execute({ id: resource.id, tenantId: TENANT_ID, correlationId: CORRELATION_ID });

    expect(await world.exceptionRepo.findByTenant(TENANT_ID)).toHaveLength(0);
  });

  it('raises one worklist entry per future booking on the resource, carrying the correlationId', async () => {
    const resource = await world.addResource('Sala 1');
    const service = await world.addService();
    const first = await world.addBooking({ service, resource, startsInHours: 24 });
    const second = await world.addBooking({
      service,
      resource,
      startsInHours: 72,
      status: BookingStatus.PENDING,
      lockState: 'HOLD',
    });

    await useCase.execute({ id: resource.id, tenantId: TENANT_ID, correlationId: CORRELATION_ID });

    const entries = await world.exceptionRepo.findByTenant(TENANT_ID, { status: 'OPEN' });
    expect(entries.map((e) => e.affectedId).sort()).toEqual([first.id, second.id].sort());
    expect(entries.every((e) => e.sourceId === resource.id)).toBe(true);
  });

  it('throws ResourceNotFoundError when the resource does not exist', async () => {
    await expect(
      useCase.execute({
        id: '00000000-0000-4000-8000-000000000099',
        tenantId: TENANT_ID,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('throws ResourceLocationCannotBeDeactivatedError for a LOCATION resource', async () => {
    const resource = await world.addResource('Unidade', ResourceType.LOCATION);

    await expect(
      useCase.execute({ id: resource.id, tenantId: TENANT_ID, correlationId: CORRELATION_ID }),
    ).rejects.toThrow(ResourceLocationCannotBeDeactivatedError);
    const stored = await world.resourceRepo.findById(resource.id, TENANT_ID);
    expect(stored!.isActive).toBe(true);
    expect(await world.exceptionRepo.findByTenant(TENANT_ID)).toHaveLength(0);
  });

  it('throws ResourceNotFoundError for a cross-tenant resource id', async () => {
    const resource = new ResourceBuilder().withTenantId(FCE_OTHER_TENANT_ID).build();
    await world.resourceRepo.save(resource);

    await expect(
      useCase.execute({ id: resource.id, tenantId: TENANT_ID, correlationId: CORRELATION_ID }),
    ).rejects.toThrow(ResourceNotFoundError);
  });
});
