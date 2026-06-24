import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import {
  StaffDeactivatedError,
  StaffEmailMismatchError,
  StaffGoogleAccountConflictError,
  StaffNotFoundError,
} from '../../domain/errors/staff-domain.error';
import { LinkGoogleAccountUseCase } from './link-google-account.use-case';

describe('LinkGoogleAccountUseCase', () => {
  let repo: InMemoryStaffRepository;
  let useCase: LinkGoogleAccountUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    useCase = new LinkGoogleAccountUseCase(repo, new InMemoryTransactionManager());
  });

  it('throws StaffNotFoundError when staffId does not exist in the tenant', async () => {
    await expect(
      useCase.execute('non-existent', {
        tenantId: '10000000-0000-4000-8000-000000000001',
        googleOAuthId: 'google-sub-123',
        email: 'staff@lavacar.com.br',
        name: 'Staff User',
      }),
    ).rejects.toThrow(StaffNotFoundError);
  });

  it('throws StaffNotFoundError when staffId exists but in a different tenant (isolation)', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('staff@lavacar.com.br')
      .build();
    await repo.save(staff);

    await expect(
      useCase.execute(staff.id, {
        tenantId: '10000000-0000-4000-8000-000000000002',
        googleOAuthId: 'google-sub-123',
        email: 'staff@lavacar.com.br',
        name: 'Staff User',
      }),
    ).rejects.toThrow(StaffNotFoundError);
  });

  it('throws StaffDeactivatedError when staff is deactivated', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('staff@lavacar.com.br')
      .build();
    staff.deactivate('other-staff-id', 'corr-test');
    await repo.save(staff);

    await expect(
      useCase.execute(staff.id, {
        tenantId: '10000000-0000-4000-8000-000000000001',
        googleOAuthId: 'google-sub-new',
        email: 'staff@lavacar.com.br',
        name: 'Staff User',
      }),
    ).rejects.toThrow(StaffDeactivatedError);
  });

  it('throws StaffEmailMismatchError when Google email does not match invited email', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('invited@lavacar.com.br')
      .build();
    await repo.save(staff);

    await expect(
      useCase.execute(staff.id, {
        tenantId: '10000000-0000-4000-8000-000000000001',
        googleOAuthId: 'google-sub-123',
        email: 'different@gmail.com',
        name: 'Staff User',
      }),
    ).rejects.toThrow(StaffEmailMismatchError);
  });

  it('throws StaffGoogleAccountConflictError when the Google account is already linked to a different staff member in the same tenant', async () => {
    const linkedStaff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('linked@lavacar.com.br')
      .withGoogleOAuthId('google-sub-shared')
      .build();
    await repo.save(linkedStaff);

    const otherStaff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('other@lavacar.com.br')
      .build();
    await repo.save(otherStaff);

    await expect(
      useCase.execute(otherStaff.id, {
        tenantId: '10000000-0000-4000-8000-000000000001',
        googleOAuthId: 'google-sub-shared',
        email: 'other@lavacar.com.br',
        name: 'Other Staff',
      }),
    ).rejects.toThrow(StaffGoogleAccountConflictError);
  });

  it('is idempotent when re-linking the same staff to the same googleOAuthId', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('gerente@lavacar.com.br')
      .withGoogleOAuthId('google-sub-existing')
      .build();
    await repo.save(staff);

    const result = await useCase.execute(staff.id, {
      tenantId: '10000000-0000-4000-8000-000000000001',
      googleOAuthId: 'google-sub-existing',
      email: 'gerente@lavacar.com.br',
      name: 'Gerente Atualizado',
    });

    expect(result.staffId).toBe(staff.id);
    const saved = await repo.findById(staff.id, '10000000-0000-4000-8000-000000000001');
    expect(saved!.googleOAuthId).toBe('google-sub-existing');
    expect(saved!.name).toBe('Gerente Atualizado');
  });

  it('links the Google account, persists name and googleOAuthId, returns result', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('gerente@lavacar.com.br')
      .withRole('MANAGER')
      .build();
    await repo.save(staff);

    const result = await useCase.execute(staff.id, {
      tenantId: '10000000-0000-4000-8000-000000000001',
      googleOAuthId: 'google-sub-new',
      email: 'gerente@lavacar.com.br',
      name: 'Gerente Silva',
    });

    expect(result.staffId).toBe(staff.id);
    expect(result.role).toBe('MANAGER');
    expect(result.tenantId).toBe('10000000-0000-4000-8000-000000000001');

    const saved = await repo.findById(staff.id, '10000000-0000-4000-8000-000000000001');
    expect(saved!.googleOAuthId).toBe('google-sub-new');
    expect(saved!.name).toBe('Gerente Silva');
    expect(saved!.isActive).toBe(true);
  });
});
