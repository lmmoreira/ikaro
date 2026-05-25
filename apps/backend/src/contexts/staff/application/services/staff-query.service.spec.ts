import { InMemoryStaffRepository } from '../../../../test/repositories/staff/in-memory-staff.repository';
import { StaffBuilder } from '../../../../test/builders/staff/staff.builder';
import { StaffQueryService } from './staff-query.service';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('StaffQueryService', () => {
  let staffRepo: InMemoryStaffRepository;
  let service: StaffQueryService;

  beforeEach(() => {
    staffRepo = new InMemoryStaffRepository();
    service = new StaffQueryService(staffRepo);
  });

  it('returns email addresses of all MANAGER staff for the tenant', async () => {
    await staffRepo.save(
      new StaffBuilder()
        .withTenantId(TENANT_ID)
        .withRole('MANAGER')
        .withEmail('mgr1@lavacar.com.br')
        .build(),
    );
    await staffRepo.save(
      new StaffBuilder()
        .withTenantId(TENANT_ID)
        .withRole('MANAGER')
        .withEmail('mgr2@lavacar.com.br')
        .build(),
    );
    await staffRepo.save(
      new StaffBuilder()
        .withTenantId(TENANT_ID)
        .withRole('STAFF')
        .withEmail('staff@lavacar.com.br')
        .build(),
    );

    const emails = await service.findManagersByTenant(TENANT_ID);

    expect(emails).toHaveLength(2);
    expect(emails).toEqual(expect.arrayContaining(['mgr1@lavacar.com.br', 'mgr2@lavacar.com.br']));
  });

  it('returns an empty array when there are no managers', async () => {
    await staffRepo.save(
      new StaffBuilder()
        .withTenantId(TENANT_ID)
        .withRole('STAFF')
        .withEmail('staff@lavacar.com.br')
        .build(),
    );

    const emails = await service.findManagersByTenant(TENANT_ID);

    expect(emails).toHaveLength(0);
  });

  it('returns an empty array when the tenant has no staff at all', async () => {
    const emails = await service.findManagersByTenant(TENANT_ID);

    expect(emails).toHaveLength(0);
  });

  it('does not return deactivated managers', async () => {
    const deactivatedMgr = new StaffBuilder()
      .withTenantId(TENANT_ID)
      .withRole('MANAGER')
      .withEmail('deactivated-mgr@lavacar.com.br')
      .withGoogleOAuthId('google-oauth-id-deactivated')
      .build();
    deactivatedMgr.deactivate('system', 'corr-deactivate');
    await staffRepo.save(deactivatedMgr);

    const emails = await service.findManagersByTenant(TENANT_ID);

    expect(emails).toHaveLength(0);
  });

  it('tenant isolation: does not return managers from another tenant', async () => {
    await staffRepo.save(
      new StaffBuilder()
        .withTenantId(OTHER_TENANT_ID)
        .withRole('MANAGER')
        .withEmail('other-mgr@other.com.br')
        .build(),
    );

    const emails = await service.findManagersByTenant(TENANT_ID);

    expect(emails).toHaveLength(0);
  });
});
