import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import {
  LastActiveManagerError,
  StaffDomainError,
  StaffNotFoundError,
} from '../../domain/errors/staff-domain.error';
import { UpdateStaffProfileUseCase } from './update-staff-profile.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('UpdateStaffProfileUseCase', () => {
  let repo: InMemoryStaffRepository;
  let useCase: UpdateStaffProfileUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    useCase = new UpdateStaffProfileUseCase(repo, new InMemoryTransactionManager());
  });

  it('updates name and role, leaving email untouched', async () => {
    const staff = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('STAFF')
      .withEmail('staff@lavacar.com.br')
      .withGoogleOAuthId('google-staff')
      .build();
    await repo.save(staff);

    const result = await useCase.execute({
      staffId: staff.id,
      tenantId: TENANT_A,
      name: 'Nome Editado',
      role: 'MANAGER',
    });

    expect(result.staffId).toBe(staff.id);
    expect(result.name).toBe('Nome Editado');
    expect(result.role).toBe('MANAGER');

    const saved = await repo.findById(staff.id, TENANT_A);
    expect(saved!.name).toBe('Nome Editado');
    expect(saved!.role).toBe('MANAGER');
    expect(saved!.email.address).toBe('staff@lavacar.com.br');
  });

  it('promotes STAFF to MANAGER without needing a manager-count check', async () => {
    const staff = new StaffBuilder().withTenantId(TENANT_A).withRole('STAFF').build();
    await repo.save(staff);

    const result = await useCase.execute({
      staffId: staff.id,
      tenantId: TENANT_A,
      name: staff.name ?? 'Nome',
      role: 'MANAGER',
    });

    expect(result.role).toBe('MANAGER');
  });

  it('demotes a MANAGER to STAFF when another active MANAGER remains', async () => {
    const manager1 = new StaffBuilder().withTenantId(TENANT_A).withRole('MANAGER').build();
    const manager2 = new StaffBuilder().withTenantId(TENANT_A).withRole('MANAGER').build();
    await repo.save(manager1);
    await repo.save(manager2);

    const result = await useCase.execute({
      staffId: manager2.id,
      tenantId: TENANT_A,
      name: manager2.name ?? 'Nome',
      role: 'STAFF',
    });

    expect(result.role).toBe('STAFF');
  });

  it('throws LastActiveManagerError when demoting the only active MANAGER', async () => {
    const manager = new StaffBuilder().withTenantId(TENANT_A).withRole('MANAGER').build();
    await repo.save(manager);

    await expect(
      useCase.execute({
        staffId: manager.id,
        tenantId: TENANT_A,
        name: manager.name ?? 'Nome',
        role: 'STAFF',
      }),
    ).rejects.toThrow(LastActiveManagerError);

    const saved = await repo.findById(manager.id, TENANT_A);
    expect(saved!.role).toBe('MANAGER');
  });

  it('does not guard against demoting an already-inactive MANAGER', async () => {
    const otherManager = new StaffBuilder().withTenantId(TENANT_A).withRole('MANAGER').build();
    const deactivatedManager = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .build();
    await repo.save(otherManager);
    await repo.save(deactivatedManager);
    deactivatedManager.deactivate(otherManager.id, 'corr-setup');
    await repo.save(deactivatedManager);

    const result = await useCase.execute({
      staffId: deactivatedManager.id,
      tenantId: TENANT_A,
      name: deactivatedManager.name ?? 'Nome',
      role: 'STAFF',
    });

    expect(result.role).toBe('STAFF');
  });

  it('throws StaffNotFoundError when staff does not exist', async () => {
    await expect(
      useCase.execute({
        staffId: 'non-existent-id',
        tenantId: TENANT_A,
        name: 'Nome',
        role: 'STAFF',
      }),
    ).rejects.toThrow(StaffNotFoundError);
  });

  it('throws StaffDomainError when name is empty', async () => {
    const staff = new StaffBuilder().withTenantId(TENANT_A).withRole('STAFF').build();
    await repo.save(staff);

    await expect(
      useCase.execute({
        staffId: staff.id,
        tenantId: TENANT_A,
        name: '',
        role: 'STAFF',
      }),
    ).rejects.toThrow(StaffDomainError);

    const saved = await repo.findById(staff.id, TENANT_A);
    expect(saved!.name).toBe(staff.name);
  });

  it('tenant isolation: throws StaffNotFoundError when staff belongs to a different tenant', async () => {
    const staff = new StaffBuilder().withTenantId(TENANT_A).withRole('STAFF').build();
    await repo.save(staff);

    await expect(
      useCase.execute({
        staffId: staff.id,
        tenantId: TENANT_B,
        name: 'Nome',
        role: 'STAFF',
      }),
    ).rejects.toThrow(StaffNotFoundError);
  });
});
