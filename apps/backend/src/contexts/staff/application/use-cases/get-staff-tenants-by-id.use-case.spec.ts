import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { GetStaffTenantsByIdUseCase } from './get-staff-tenants-by-id.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetStaffTenantsByIdUseCase', () => {
  let repo: InMemoryStaffRepository;
  let useCase: GetStaffTenantsByIdUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    useCase = new GetStaffTenantsByIdUseCase(repo);
  });

  it('throws StaffNotFoundError when staffId does not exist', async () => {
    await expect(
      useCase.execute({ staffId: '00000000-0000-4000-8000-000000000099', tenantId: TENANT_A }),
    ).rejects.toMatchObject({ name: 'StaffNotFoundError' });
  });

  it('returns just the current tenant when staff has no linked googleOAuthId', async () => {
    const staff = new StaffBuilder().withTenantId(TENANT_A).withRole('MANAGER').build();
    await repo.save(staff);

    const result = await useCase.execute({ staffId: staff.id, tenantId: TENANT_A });

    expect(result).toHaveLength(1);
    expect(result[0].staffId).toBe(staff.id);
    expect(result[0].tenantId).toBe(TENANT_A);
    expect(result[0].role).toBe('MANAGER');
    expect(result[0].isActive).toBe(true);
  });

  it('returns all tenants for a staff member linked via googleOAuthId', async () => {
    const staff1 = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .withGoogleOAuthId('google-sub-123')
      .build();
    const staff2 = new StaffBuilder()
      .withTenantId(TENANT_B)
      .withRole('STAFF')
      .withGoogleOAuthId('google-sub-123')
      .build();
    await repo.save(staff1);
    await repo.save(staff2);

    const result = await useCase.execute({ staffId: staff1.id, tenantId: TENANT_A });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.tenantId)).toEqual(expect.arrayContaining([TENANT_A, TENANT_B]));
  });

  it('includes inactive records from other tenants (caller decides whether to filter)', async () => {
    const staff1 = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withGoogleOAuthId('google-sub-multi')
      .build();
    const staff2 = new StaffBuilder()
      .withTenantId(TENANT_B)
      .withGoogleOAuthId('google-sub-multi')
      .build();
    staff2.deactivate(staff1.id, 'corr-test');
    await repo.save(staff1);
    await repo.save(staff2);

    const result = await useCase.execute({ staffId: staff1.id, tenantId: TENANT_A });

    expect(result).toHaveLength(2);
    const tenantBResult = result.find((r) => r.tenantId === TENANT_B);
    expect(tenantBResult?.isActive).toBe(false);
  });
});
