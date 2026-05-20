import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { StaffNotFoundError } from '../../domain/errors/staff-domain.error';
import { GetStaffByOAuthIdUseCase } from './get-staff-by-oauth-id.use-case';

describe('GetStaffByOAuthIdUseCase', () => {
  let repo: InMemoryStaffRepository;
  let useCase: GetStaffByOAuthIdUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    useCase = new GetStaffByOAuthIdUseCase(repo);
  });

  it('throws StaffNotFoundError when no staff exists for the given googleOAuthId', async () => {
    await expect(useCase.execute('google-sub-unknown')).rejects.toThrow(StaffNotFoundError);
  });

  it('returns GetStaffByOAuthIdUseCaseResult with correct fields for an active MANAGER', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withRole('MANAGER')
      .withGoogleOAuthId('google-sub-manager')
      .build();
    await repo.save(staff);

    const result = await useCase.execute('google-sub-manager');

    expect(result.staffId).toBe(staff.id);
    expect(result.tenantId).toBe('10000000-0000-4000-8000-000000000001');
    expect(result.role).toBe('MANAGER');
    expect(result.isActive).toBe(true);
  });

  it('returns isActive=false for a deactivated staff member (googleOAuthId retained)', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000002')
      .withRole('STAFF')
      .withGoogleOAuthId('google-sub-deactivated')
      .build();
    staff.deactivate('other-staff-id', 'corr-test');
    await repo.save(staff);

    const result = await useCase.execute('google-sub-deactivated');

    expect(result.isActive).toBe(false);
    expect(result.role).toBe('STAFF');
  });

  it('throws StaffNotFoundError for invited-but-not-yet-activated staff (googleOAuthId is null)', async () => {
    const invited = new StaffBuilder().withTenantId('10000000-0000-4000-8000-000000000003').build();
    await repo.save(invited);

    await expect(useCase.execute('any-sub')).rejects.toThrow(StaffNotFoundError);
  });
});
