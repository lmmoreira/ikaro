import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { StaffActivated } from '../../domain/events/staff-activated.event';
import {
  StaffAlreadyActiveError,
  StaffNotFoundError,
  StaffSelfReactivationError,
} from '../../domain/errors/staff-domain.error';
import { ActivateStaffUseCase } from './activate-staff.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const CORRELATION_ID = 'corr-activate-test';

describe('ActivateStaffUseCase', () => {
  let repo: InMemoryStaffRepository;
  let eventBus: InMemoryEventBus;
  let useCase: ActivateStaffUseCase;

  beforeEach(() => {
    eventBus = new InMemoryEventBus();
    repo = new InMemoryStaffRepository(eventBus);
    useCase = new ActivateStaffUseCase(repo, new InMemoryTransactionManager());
  });

  it('activates a deactivated STAFF member — clears deactivatedBy and publishes StaffActivated', async () => {
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
    staff.deactivate(manager.id, 'corr-setup');
    staff.clearDomainEvents();
    await repo.save(manager);
    await repo.save(staff);

    const result = await useCase.execute({
      staffId: staff.id,
      tenantId: TENANT_A,
      activatedBy: manager.id,
      correlationId: CORRELATION_ID,
    });

    expect(result.staffId).toBe(staff.id);
    expect(result.isActive).toBe(true);

    const saved = await repo.findById(staff.id, TENANT_A);
    expect(saved!.isActive).toBe(true);
    expect(saved!.deactivatedBy).toBeNull();

    expect(eventBus.published).toHaveLength(1);
    const event = eventBus.published[0] as StaffActivated;
    expect(event.eventName).toBe('StaffActivated');
    expect(event.data.staffId).toBe(staff.id);
    expect(event.tenantId).toBe(TENANT_A);
    expect(event.correlationId).toBe(CORRELATION_ID);
  });

  it('throws StaffNotFoundError when staff does not exist', async () => {
    await expect(
      useCase.execute({
        staffId: 'non-existent-id',
        tenantId: TENANT_A,
        activatedBy: 'any-actor',
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(StaffNotFoundError);
    expect(eventBus.published).toHaveLength(0);
  });

  it('throws StaffSelfReactivationError when activating own account', async () => {
    const manager = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .withEmail('manager@lavacar.com.br')
      .withGoogleOAuthId('google-manager')
      .build();
    manager.deactivate('some-other-actor', 'corr-setup');
    manager.clearDomainEvents();
    await repo.save(manager);

    await expect(
      useCase.execute({
        staffId: manager.id,
        tenantId: TENANT_A,
        activatedBy: manager.id,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(StaffSelfReactivationError);
    expect(eventBus.published).toHaveLength(0);
  });

  it('throws StaffAlreadyActiveError when the member is already active', async () => {
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

    await expect(
      useCase.execute({
        staffId: staff.id,
        tenantId: TENANT_A,
        activatedBy: manager.id,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(StaffAlreadyActiveError);
    expect(eventBus.published).toHaveLength(0);
  });

  it('tenant isolation: throws StaffNotFoundError when staff belongs to a different tenant', async () => {
    const staff = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('STAFF')
      .withEmail('staff@tenanta.com.br')
      .withGoogleOAuthId('google-staff-a')
      .build();
    staff.deactivate('some-other-actor', 'corr-setup');
    staff.clearDomainEvents();
    await repo.save(staff);

    await expect(
      useCase.execute({
        staffId: staff.id,
        tenantId: TENANT_B,
        activatedBy: 'any-actor',
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toThrow(StaffNotFoundError);
    expect(eventBus.published).toHaveLength(0);
  });
});
