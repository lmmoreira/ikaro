import { StaffBuilder } from '../../../../test/builders/staff';
import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { GetStaffUseCase } from './get-staff.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('GetStaffUseCase', () => {
  let repo: InMemoryStaffRepository;
  let useCase: GetStaffUseCase;

  beforeEach(() => {
    repo = new InMemoryStaffRepository();
    useCase = new GetStaffUseCase(repo);
  });

  it('returns empty list when no staff exists for the tenant', async () => {
    const result = await useCase.execute({ tenantId: TENANT_A, limit: 50, offset: 0 });

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

    const result = await useCase.execute({ tenantId: TENANT_A, limit: 50, offset: 0 });

    expect(result.items).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
    const managerItem = result.items.find((i) => i.email === 'gerente@lavacar.com.br');
    expect(managerItem).toMatchObject({
      name: 'Gerente Silva',
      role: 'MANAGER',
      isActive: true,
      googleOAuthId: 'google-sub-1',
    });
    const staffItem = result.items.find((i) => i.email === 'staff@lavacar.com.br');
    expect(staffItem?.googleOAuthId).toBeNull();
  });

  it('filters by role and active status', async () => {
    const manager = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .withEmail('manager@lavacar.com.br')
      .build();
    const staff = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('STAFF')
      .withEmail('staff@lavacar.com.br')
      .build();
    const deactivatedManager = new StaffBuilder()
      .withTenantId(TENANT_A)
      .withRole('MANAGER')
      .withEmail('old-manager@lavacar.com.br')
      .withGoogleOAuthId('google-old-manager')
      .build();
    deactivatedManager.deactivate('system', 'corr-deactivate');
    await repo.save(manager);
    await repo.save(staff);
    await repo.save(deactivatedManager);

    const result = await useCase.execute({
      tenantId: TENANT_A,
      roles: ['MANAGER'],
      status: 'ACTIVE',
      limit: 50,
      offset: 0,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].email).toBe('manager@lavacar.com.br');
  });

  it('filters by search', async () => {
    await repo.save(
      new StaffBuilder()
        .withTenantId(TENANT_A)
        .withEmail('ana@lavacar.com.br')
        .withName('Ana Souza')
        .build(),
    );
    await repo.save(
      new StaffBuilder()
        .withTenantId(TENANT_A)
        .withEmail('bruno@lavacar.com.br')
        .withName('Bruno Lima')
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_A,
      search: 'ana',
      limit: 50,
      offset: 0,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].email).toBe('ana@lavacar.com.br');
  });

  it('respects limit and offset', async () => {
    for (let i = 1; i <= 3; i++) {
      await repo.save(
        new StaffBuilder().withTenantId(TENANT_A).withEmail(`s${i}@lavacar.com.br`).build(),
      );
    }

    const page1 = await useCase.execute({ tenantId: TENANT_A, limit: 2, offset: 0 });
    const page2 = await useCase.execute({ tenantId: TENANT_A, limit: 2, offset: 2 });

    expect(page1.items).toHaveLength(2);
    expect(page1.pagination.nextOffset).toBe(2);
    expect(page2.items).toHaveLength(1);
    expect(page2.pagination.nextOffset).toBeNull();
  });

  it('tenant isolation: does not return staff from other tenants', async () => {
    await repo.save(
      new StaffBuilder().withTenantId(TENANT_A).withEmail('a@tenanta.com.br').build(),
    );
    await repo.save(
      new StaffBuilder().withTenantId(TENANT_B).withEmail('b@tenantb.com.br').build(),
    );

    const result = await useCase.execute({ tenantId: TENANT_A, limit: 50, offset: 0 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].email).toBe('a@tenanta.com.br');
  });
});
