import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { StaffDeactivated } from '../../domain/events/staff-deactivated.event';
import {
  LastActiveManagerError,
  StaffNotFoundError,
  StaffSelfDeactivationError,
} from '../../domain/errors/staff-domain.error';
import { DeactivateStaffUseCase } from './deactivate-staff.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const CORRELATION_ID = 'corr-deactivate-test';

describe('DeactivateStaffUseCase', () => {
  let repo: InMemoryStaffRepository;
  let eventBus: InMemoryEventBus;
  let useCase: DeactivateStaffUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    eventBus = new InMemoryEventBus();
    useCase = new DeactivateStaffUseCase(repo, new InMemoryTransactionManager(), eventBus);
  });

  it('deactivates a STAFF member — stores deactivatedBy and publishes StaffDeactivated', async () => {
    const manager = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .withEmail('manager@lavacar.com.br')
      .withGoogleOAuthId('google-manager')
      .build();
    const staff = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('STAFF')
      .withEmail('staff@lavacar.com.br')
      .withGoogleOAuthId('google-staff')
      .build();
    await repo.save(manager);
    await repo.save(staff);

    const result = await useCase.execute({
      staffId: staff.id,
      tenantId: TENANT_A,
      deactivatedBy: manager.id,
      correlationId: CORRELATION_ID,
    });

    expect(result.staffId).toBe(staff.id);
    expect(result.isActive).toBe(false);

    const saved = await repo.findById(staff.id, TENANT_A);
    expect(saved!.isActive).toBe(false);
    expect(saved!.deactivatedBy).toBe(manager.id);

    expect(eventBus.published).toHaveLength(1);
    const event = eventBus.published[0] as StaffDeactivated;
    expect(event.eventName).toBe('StaffDeactivated');
    expect(event.data.staffId).toBe(staff.id);
    expect(event.tenantId).toBe(TENANT_A);
    expect(event.correlationId).toBe(CORRELATION_ID);
  });

  it('deactivates a MANAGER when another active MANAGER remains', async () => {
    const manager1 = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .withEmail('m1@lavacar.com.br')
      .withGoogleOAuthId('google-m1')
      .build();
    const manager2 = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .withEmail('m2@lavacar.com.br')
      .withGoogleOAuthId('google-m2')
      .build();
    await repo.save(manager1);
    await repo.save(manager2);

    const result = await useCase.execute({
      staffId: manager2.id,
      tenantId: TENANT_A,
      deactivatedBy: manager1.id,
      correlationId: CORRELATION_ID,
    });

    expect(result.isActive).toBe(false);
    expect(eventBus.published).toHaveLength(1);
  });

  it('throws StaffNotFoundError when staff does not exist', async () => {
    await expect(
      useCase.execute({
        staffId: 'non-existent-id',
        tenantId: TENANT_A,
        deactivatedBy: 'any-actor',
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(StaffNotFoundError);
    expect(eventBus.published).toHaveLength(0);
  });

  it('throws StaffSelfDeactivationError when deactivating own account', async () => {
    const manager = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .withEmail('manager@lavacar.com.br')
      .withGoogleOAuthId('google-manager')
      .build();
    await repo.save(manager);

    await expect(
      useCase.execute({
        staffId: manager.id,
        tenantId: TENANT_A,
        deactivatedBy: manager.id,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(StaffSelfDeactivationError);
    expect(eventBus.published).toHaveLength(0);
  });

  it('throws LastActiveManagerError when deactivating the only active MANAGER', async () => {
    const manager = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .withEmail('manager@lavacar.com.br')
      .withGoogleOAuthId('google-manager')
      .build();
    const actor = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .withEmail('other@lavacar.com.br')
      .withGoogleOAuthId('google-other')
      .build();
    await repo.save(manager);
    await repo.save(actor);
    actor.deactivate(manager.id, 'corr-setup');
    await repo.save(actor);

    await expect(
      useCase.execute({
        staffId: manager.id,
        tenantId: TENANT_A,
        deactivatedBy: actor.id,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(LastActiveManagerError);
    expect(eventBus.published).toHaveLength(0);
  });

  it('tenant isolation: throws StaffNotFoundError when staff belongs to a different tenant', async () => {
    const staff = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('STAFF')
      .withEmail('staff@tenanta.com.br')
      .withGoogleOAuthId('google-staff-a')
      .build();
    await repo.save(staff);

    await expect(
      useCase.execute({
        staffId: staff.id,
        tenantId: TENANT_B,
        deactivatedBy: 'any-actor',
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(StaffNotFoundError);
    expect(eventBus.published).toHaveLength(0);
  });
});
