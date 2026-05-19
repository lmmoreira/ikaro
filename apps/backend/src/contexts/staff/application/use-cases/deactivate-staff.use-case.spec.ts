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
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';

describe('DeactivateStaffUseCase', () => {
  let repo: InMemoryStaffRepository;
  let eventBus: InMemoryEventBus;
  let useCase: DeactivateStaffUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    eventBus = new InMemoryEventBus();
    useCase = new DeactivateStaffUseCase(repo, new InMemoryTransactionManager(), eventBus);
  });

  it('deactivates a STAFF member and publishes StaffDeactivated', async () => {
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

    const result = await useCase.execute(staff.id, TENANT_A, manager.id);

    expect(result.staffId).toBe(staff.id);
    expect(result.isActive).toBe(false);

    const saved = await repo.findById(staff.id, TENANT_A);
    expect(saved!.isActive).toBe(false);

    expect(eventBus.published).toHaveLength(1);
    const event = eventBus.published[0] as StaffDeactivated;
    expect(event.eventName).toBe('StaffDeactivated');
    expect(event.data.staffId).toBe(staff.id);
    expect(event.data.tenantId).toBe(TENANT_A);
    expect(event.data.deactivatedBy).toBe(manager.id);
    expect(event.tenantId).toBe(TENANT_A);
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

    const result = await useCase.execute(manager2.id, TENANT_A, manager1.id);

    expect(result.isActive).toBe(false);
    expect(eventBus.published).toHaveLength(1);
  });

  it('throws StaffNotFoundError when staff does not exist', async () => {
    await expect(useCase.execute('non-existent-id', TENANT_A, MANAGER_ID)).rejects.toThrow(
      StaffNotFoundError,
    );
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

    await expect(useCase.execute(manager.id, TENANT_A, manager.id)).rejects.toThrow(
      StaffSelfDeactivationError,
    );
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
    // actor is different person but deactivating the last manager
    // In real flow actor IS a manager who is also the only one — but we test
    // the case where actor tries to deactivate a different manager who is the last
    await repo.save(actor);
    // Deactivate actor first so manager is the only one left
    actor.deactivate(manager.id);
    await repo.save(actor);

    await expect(useCase.execute(manager.id, TENANT_A, actor.id)).rejects.toThrow(
      LastActiveManagerError,
    );
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

    await expect(useCase.execute(staff.id, TENANT_B, MANAGER_ID)).rejects.toThrow(
      StaffNotFoundError,
    );
    expect(eventBus.published).toHaveLength(0);
  });
});
