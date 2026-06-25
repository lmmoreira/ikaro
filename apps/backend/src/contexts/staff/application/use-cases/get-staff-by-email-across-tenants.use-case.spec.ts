import { StaffBuilder } from '../../../../test/builders/staff/staff.builder';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { GetStaffByEmailAcrossTenantsUseCase } from './get-staff-by-email-across-tenants.use-case';

describe('GetStaffByEmailAcrossTenantsUseCase', () => {
  let repo: InMemoryStaffRepository;
  let useCase: GetStaffByEmailAcrossTenantsUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    useCase = new GetStaffByEmailAcrossTenantsUseCase(repo);
  });

  it('returns empty array when no staff exists for the given email', async () => {
    const result = await useCase.execute('unknown@example.com');
    expect(result).toEqual([]);
  });

  it('returns one result for a staff member invited at a single tenant', async () => {
    const staff = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withRole('MANAGER')
      .withEmail('manager@example.com')
      .build();
    await repo.save(staff);

    const result = await useCase.execute('manager@example.com');

    expect(result).toHaveLength(1);
    expect(result[0].staffId).toBe(staff.id);
    expect(result[0].tenantId).toBe('10000000-0000-4000-8000-000000000001');
    expect(result[0].role).toBe('MANAGER');
    expect(result[0].isActive).toBe(true);
  });

  it('normalizes email case and whitespace before searching', async () => {
    const staff = new StaffBuilder().withEmail('manager@example.com').build();
    await repo.save(staff);

    const result = await useCase.execute('  Manager@Example.com  ');

    expect(result).toHaveLength(1);
  });

  it('returns multiple records when the same email is invited at more than one tenant', async () => {
    const staff1 = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000001')
      .withEmail('multi@example.com')
      .build();
    const staff2 = new StaffBuilder()
      .withTenantId('10000000-0000-4000-8000-000000000002')
      .withEmail('multi@example.com')
      .build();
    await repo.save(staff1);
    await repo.save(staff2);

    const result = await useCase.execute('multi@example.com');

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.tenantId)).toContain('10000000-0000-4000-8000-000000000001');
    expect(result.map((r) => r.tenantId)).toContain('10000000-0000-4000-8000-000000000002');
  });

  it('includes a deactivated staff member with isActive=false', async () => {
    const staff = new StaffBuilder().withEmail('deactivated@example.com').build();
    staff.deactivate('other-staff-id', 'corr-test');
    await repo.save(staff);

    const result = await useCase.execute('deactivated@example.com');

    expect(result).toHaveLength(1);
    expect(result[0].isActive).toBe(false);
  });
});
