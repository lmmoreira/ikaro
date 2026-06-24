import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { ListStaffUseCase } from './list-staff.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('ListStaffUseCase', () => {
  let repo: InMemoryStaffRepository;
  let useCase: ListStaffUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    useCase = new ListStaffUseCase(repo);
  });

  it('returns empty list when no staff exists for the tenant', async () => {
    const result = await useCase.execute(TENANT_A, 50, 0);

    expect(result.items).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.hasMore).toBe(false);
    expect(result.pagination.nextOffset).toBeNull();
  });

  it('returns all staff for the tenant with correct shape', async () => {
    const manager = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withEmail('gerente@lavacar.com.br')
      .withRole('MANAGER')
      .withGoogleOAuthId('google-sub-1')
      .withName('Gerente Silva')
      .build();
    const staff = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withEmail('staff@lavacar.com.br')
      .withRole('STAFF')
      .build();
    await repo.save(manager);
    await repo.save(staff);

    const result = await useCase.execute(TENANT_A, 50, 0);

    expect(result.items).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    expect(result.pagination.hasMore).toBe(false);

    const managerItem = result.items.find((i) => i.email === 'gerente@lavacar.com.br');
    expect(managerItem).toBeDefined();
    expect(managerItem!.name).toBe('Gerente Silva');
    expect(managerItem!.role).toBe('MANAGER');
    expect(managerItem!.isActive).toBe(true);
  });

  it('name is stored at invite time even for newly invited (not yet linked) staff', async () => {
    const invited = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withEmail('invited@lavacar.com.br')
      .withRole('STAFF')
      .withName('Test User')
      .build();
    await repo.save(invited);

    const result = await useCase.execute(TENANT_A, 50, 0);

    expect(result.items[0].name).toBe('Test User');
    expect(result.items[0].isActive).toBe(true);
  });

  it('respects limit and offset — pagination fields are correct', async () => {
    for (let i = 1; i <= 3; i++) {
      const s = new StaffBuilder().withTenantId(TENANT_A).withEmail(`s${i}@lavacar.com.br`).build();
      await repo.save(s);
    }

    const page1 = await useCase.execute(TENANT_A, 2, 0);
    expect(page1.items).toHaveLength(2);
    expect(page1.pagination.total).toBe(3);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.pagination.nextOffset).toBe(2);

    const page2 = await useCase.execute(TENANT_A, 2, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.pagination.hasMore).toBe(false);
    expect(page2.pagination.nextOffset).toBeNull();
  });

  it('tenant isolation: does not return staff from other tenants', async () => {
    const staffA = new StaffBuilder().withTenantId(TENANT_A).withEmail('a@tenanta.com.br').build();
    const staffB = new StaffBuilder().withTenantId(TENANT_B).withEmail('b@tenantb.com.br').build();
    await repo.save(staffA);
    await repo.save(staffB);

    const result = await useCase.execute(TENANT_A, 50, 0);

    expect(result.items).toHaveLength(1);
    expect(result.items[0].email).toBe('a@tenanta.com.br');
  });
});
