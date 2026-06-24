import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { GetStaffByOAuthIdUseCase } from './get-staff-by-oauth-id.use-case';

describe('GetStaffByOAuthIdUseCase', () => {
  let repo: InMemoryStaffRepository;
  let useCase: GetStaffByOAuthIdUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    useCase = new GetStaffByOAuthIdUseCase(repo);
  });

  it('returns empty array when no staff exists for the given googleOAuthId', async () => {
    const result = await useCase.execute('google-sub-unknown');
    expect(result).toEqual([]);
  });

  it('returns array with one result for a single matching staff', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withRole('MANAGER')
      .withGoogleOAuthId('google-sub-manager')
      .build();
    await repo.save(staff);

    const result = await useCase.execute('google-sub-manager');

    expect(result).toHaveLength(1);
    expect(result[0].staffId).toBe(staff.id);
    expect(result[0].tenantId).toBe('10000000-0000-4000-8000-000000000001');
    expect(result[0].role).toBe('MANAGER');
    expect(result[0].isActive).toBe(true);
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

    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(false);
    expect(result[0].role).toBe('STAFF');
  });

  it('returns multiple records when same googleOAuthId is linked across tenants', async () => {
    const staff1 = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withGoogleOAuthId('google-sub-multi')
      .build();
    const staff2 = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000002')
      .withGoogleOAuthId('google-sub-multi')
      .build();
    await repo.save(staff1);
    await repo.save(staff2);

    const result = await useCase.execute('google-sub-multi');

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.tenantId)).toContain('10000000-0000-4000-8000-000000000001');
    expect(result.map((r) => r.tenantId)).toContain('10000000-0000-4000-8000-000000000002');
  });

  it('returns empty array when staff has no googleOAuthId (never linked)', async () => {
    const invited = new StaffBuilder().withTenantId('10000000-0000-4000-8000-000000000003').build();
    await repo.save(invited);

    const result = await useCase.execute('any-sub');
    expect(result).toEqual([]);
  });
});
