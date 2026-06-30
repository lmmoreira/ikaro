import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { StaffInvited } from '../../domain/events/staff-invited.event';
import { StaffAlreadyExistsError } from '../../domain/errors/staff-domain.error';
import { InviteStaffUseCase } from './invite-staff.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';
const MANAGER_ID = '20000000-0000-4000-8000-000000000001';
const CORRELATION_ID = 'corr-invite-test';

const baseDto = {
  tenantId: TENANT_A,
  email: 'novo@lavacar.com.br',
  firstName: 'João',
  lastName: 'Silva',
  role: 'STAFF' as const,
  invitedBy: MANAGER_ID,
  correlationId: CORRELATION_ID,
};

describe('InviteStaffUseCase', () => {
  let repo: InMemoryStaffRepository;
  let eventBus: InMemoryEventBus;
  let useCase: InviteStaffUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    eventBus = new InMemoryEventBus();
    useCase = new InviteStaffUseCase(repo, new InMemoryTransactionManager(), eventBus);
  });

  it('creates an active staff row with name stored and publishes StaffInvited', async () => {
    const result = await useCase.execute(baseDto);

    expect(result.email).toBe('novo@lavacar.com.br');
    expect(result.role).toBe('STAFF');
    expect(result.isActive).toBe(true);
    expect(result.staffId).toBeDefined();

    const saved = await repo.findByTenantAndEmail(TENANT_A, 'novo@lavacar.com.br');
    expect(saved).not.toBeNull();
    expect(saved!.isActive).toBe(true);
    expect(saved!.name).toBe('João Silva');
    expect(saved!.invitedBy).toBe(MANAGER_ID);

    expect(eventBus.published).toHaveLength(1);
    const event = eventBus.published[0] as StaffInvited;
    expect(event.eventName).toBe('StaffInvited');
    expect(event.data.staffId).toBe(result.staffId);
    expect(event.tenantId).toBe(TENANT_A);
    expect(event.correlationId).toBe(CORRELATION_ID);
  });

  it('normalises email to lowercase before saving', async () => {
    const result = await useCase.execute({ ...baseDto, email: 'NOVO@Lavacar.COM.BR' });

    expect(result.email).toBe('novo@lavacar.com.br');
    const saved = await repo.findByTenantAndEmail(TENANT_A, 'novo@lavacar.com.br');
    expect(saved).not.toBeNull();
  });

  it('throws StaffAlreadyExistsError when email already has a linked Google account', async () => {
    const active = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withEmail('novo@lavacar.com.br')
      .withGoogleOAuthId('google-sub-active')
      .build();
    await repo.save(active);

    await expect(useCase.execute(baseDto)).rejects.toThrow(StaffAlreadyExistsError);
    expect(eventBus.published).toHaveLength(0);
  });

  it('resends invite (A2) when email exists but google account not yet linked — updates name and role', async () => {
    const inactive = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withEmail('novo@lavacar.com.br')
      .withRole('STAFF')
      .build();
    await repo.save(inactive);

    const result = await useCase.execute({
      ...baseDto,
      role: 'MANAGER',
      firstName: 'João',
      lastName: 'Atualizado',
    });

    expect(result.staffId).toBe(inactive.id);
    expect(result.isActive).toBe(true);
    expect(result.role).toBe('MANAGER');

    const saved = await repo.findByTenantAndEmail(TENANT_A, 'novo@lavacar.com.br');
    expect(saved!.name).toBe('João Atualizado');
    expect(saved!.invitedBy).toBe(MANAGER_ID);

    expect(eventBus.published).toHaveLength(1);
    expect((eventBus.published[0] as StaffInvited).eventName).toBe('StaffInvited');

    const allStaff = await repo.findAllByTenant(TENANT_A, { limit: 100, offset: 0 });
    expect(allStaff.total).toBe(1);
  });

  it('tenant isolation: active staff in Tenant B does not block invite in Tenant A', async () => {
    const otherTenantStaff = new StaffBuilder()
      .withTenantId(TENANT_B)
      .withEmail('novo@lavacar.com.br')
      .withGoogleOAuthId('google-sub-tenant-b')
      .build();
    await repo.save(otherTenantStaff);

    const result = await useCase.execute(baseDto);

    expect(result.staffId).not.toBe(otherTenantStaff.id);
    expect(result.isActive).toBe(true);
  });

  it('assigns tenantId from dto to the new staff row', async () => {
    const result = await useCase.execute(baseDto);
    const saved = await repo.findByTenantAndEmail(TENANT_A, 'novo@lavacar.com.br');
    expect(saved!.tenantId).toBe(TENANT_A);
    expect(result.staffId).toBe(saved!.id);
  });
});
