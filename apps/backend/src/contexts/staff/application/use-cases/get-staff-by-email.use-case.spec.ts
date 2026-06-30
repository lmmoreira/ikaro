import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { StaffNotFoundError } from '../../domain/errors/staff-domain.error';
import { GetStaffByEmailUseCase } from './get-staff-by-email.use-case';

describe('GetStaffByEmailUseCase', () => {
  let repo: InMemoryStaffRepository;
  let useCase: GetStaffByEmailUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    useCase = new GetStaffByEmailUseCase(repo);
  });

  it('throws StaffNotFoundError when no staff exists for the given email + tenantId', async () => {
    await expect(
      useCase.execute({ email: 'unknown@lavacar.com.br', tenantId: '10000000-0000-4000-8000-000000000001' }),
    ).rejects.toThrow(StaffNotFoundError);
  });

  it('throws StaffNotFoundError when staff exists but in a different tenant (isolation)', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('staff@lavacar.com.br')
      .build();
    await repo.save(staff);

    await expect(
      useCase.execute({ email: 'staff@lavacar.com.br', tenantId: '10000000-0000-4000-8000-000000000002' }),
    ).rejects.toThrow(StaffNotFoundError);
  });

  it('returns GetStaffByEmailUseCaseResult for a newly invited (not yet linked) staff member', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('gerente@lavacar.com.br')
      .withRole('MANAGER')
      .build();
    await repo.save(staff);

    const result = await useCase.execute({
      email: 'gerente@lavacar.com.br',
      tenantId: '10000000-0000-4000-8000-000000000001',
    });

    expect(result.staffId).toBe(staff.id);
    expect(result.email).toBe('gerente@lavacar.com.br');
    expect(result.role).toBe('MANAGER');
    expect(result.isActive).toBe(true);
    expect(result.googleOAuthId).toBeNull();
  });

  it('returns isActive=true and googleOAuthId for a staff member with a linked Google account', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('staff@lavacar.com.br')
      .withGoogleOAuthId('google-sub-active')
      .build();
    await repo.save(staff);

    const result = await useCase.execute({
      email: 'staff@lavacar.com.br',
      tenantId: '10000000-0000-4000-8000-000000000001',
    });

    expect(result.isActive).toBe(true);
    expect(result.googleOAuthId).toBe('google-sub-active');
  });
});
