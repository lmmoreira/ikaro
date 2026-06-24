import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { StaffBuilder } from '../../../../test/builders/staff/index';
import { StaffEntity } from '../entities/staff.entity';
import { TypeOrmStaffRepository } from './typeorm-staff.repository';

describe('TypeOrmStaffRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmStaffRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmStaffRepository(dataSource.getRepository(StaffEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('creates and retrieves a staff member — all fields survive the round-trip', async () => {
    const staff = new StaffBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000020')
      .withEmail('gerente@lavacar-m03s02.com.br')
      .withRole('MANAGER')
      .build();

    await repo.save(staff);

    const found = await repo.findByTenantAndEmail(
      '00000000-0000-0000-0000-000000000020',
      'gerente@lavacar-m03s02.com.br',
    );
    expect(found).not.toBeNull();
    expect(found!.id).toBe(staff.id);
    expect(found!.role).toBe('MANAGER');
    expect(found!.isActive).toBe(false);
    expect(found!.googleOAuthId).toBeNull();
  });

  it('activate sets googleOAuthId, name, and isActive=true — all persist correctly', async () => {
    const staff = new StaffBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000021')
      .withEmail('staff@lavacar-m03s02.com.br')
      .withRole('STAFF')
      .build();
    await repo.save(staff);

    staff.linkGoogleAccount('google-sub-m03s02-activate', 'Staff Ativado');
    await repo.save(staff);

    const found = await repo.findByTenantAndOAuthId(
      '00000000-0000-0000-0000-000000000021',
      'google-sub-m03s02-activate',
    );
    expect(found).not.toBeNull();
    expect(found!.googleOAuthId).toBe('google-sub-m03s02-activate');
    expect(found!.name).toBe('Staff Ativado');
    expect(found!.isActive).toBe(true);
  });

  it('single-tenant: same google_oauth_id in different tenants causes unique constraint violation', async () => {
    const sharedSub = 'google-sub-m03s02-single-tenant';

    const staffA = new StaffBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000022')
      .withEmail('a@tenanta.com.br')
      .withGoogleOAuthId(sharedSub)
      .build();
    await repo.save(staffA);

    const staffB = new StaffBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000023')
      .withEmail('a@tenantb.com.br')
      .withGoogleOAuthId(sharedSub)
      .build();

    await expect(repo.save(staffB)).rejects.toThrow();
  });

  it('multiple null googleOAuthId rows in the same tenant are allowed (invited but not yet activated)', async () => {
    const staffA = new StaffBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000024')
      .withEmail('invite1@lavacar.com.br')
      .build();
    const staffB = new StaffBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000024')
      .withEmail('invite2@lavacar.com.br')
      .build();

    await repo.save(staffA);
    await expect(repo.save(staffB)).resolves.toBeUndefined();
  });

  it('findById returns null for wrong tenant (isolation)', async () => {
    const staff = new StaffBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000025')
      .withEmail('iso@lavacar.com.br')
      .build();
    await repo.save(staff);

    const wrongTenant = await repo.findById(staff.id, '00000000-0000-0000-0000-000000000099');
    expect(wrongTenant).toBeNull();
  });

  it('findAllByTenant returns only staff for the given tenant with pagination', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000026';

    const s1 = new StaffBuilder().withTenantId(tenantId).withEmail('s1@lavacar.com.br').build();
    const s2 = new StaffBuilder().withTenantId(tenantId).withEmail('s2@lavacar.com.br').build();
    const other = new StaffBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000027')
      .withEmail('other@lavacar.com.br')
      .build();

    await repo.save(s1);
    await repo.save(s2);
    await repo.save(other);

    const { items, total } = await repo.findAllByTenant(tenantId, 50, 0);
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((s) => s.tenantId === tenantId)).toBe(true);
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it('findAllByTenant respects limit and offset', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000029';

    for (let i = 1; i <= 3; i++) {
      const s = new StaffBuilder()
        .withTenantId(tenantId)
        .withEmail(`page${i}@lavacar.com.br`)
        .build();
      await repo.save(s);
    }

    const page1 = await repo.findAllByTenant(tenantId, 2, 0);
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);

    const page2 = await repo.findAllByTenant(tenantId, 2, 2);
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(3);
  });

  it('countActiveManagersByTenant counts only active managers for the tenant', async () => {
    const tenantId = '00000000-0000-0000-0000-000000000028';

    const manager = new StaffBuilder()
      .withTenantId(tenantId)
      .withEmail('mgr@lavacar.com.br')
      .withRole('MANAGER')
      .withGoogleOAuthId('google-sub-m03s02-count-mgr')
      .build();
    const inactiveManager = new StaffBuilder()
      .withTenantId(tenantId)
      .withEmail('mgr-inactive@lavacar.com.br')
      .withRole('MANAGER')
      .build();
    const staffMember = new StaffBuilder()
      .withTenantId(tenantId)
      .withEmail('staff-count@lavacar.com.br')
      .withRole('STAFF')
      .withGoogleOAuthId('google-sub-m03s02-count-staff')
      .build();

    await repo.save(manager);
    await repo.save(inactiveManager);
    await repo.save(staffMember);

    const count = await repo.countActiveManagersByTenant(tenantId);
    expect(count).toBe(1);
  });
});
