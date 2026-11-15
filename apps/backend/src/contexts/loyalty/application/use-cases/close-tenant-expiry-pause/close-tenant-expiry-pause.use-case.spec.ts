import { InMemoryTenantExpiryPauseRepository } from '../../../../../test/repositories/loyalty/in-memory-tenant-expiry-pause.repository';
import { RecordTenantExpiryPauseUseCase } from '../record-tenant-expiry-pause/record-tenant-expiry-pause.use-case';
import { CloseTenantExpiryPauseUseCase } from './close-tenant-expiry-pause.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const SUSPENDED_AT = new Date('2026-11-01T10:00:00.000Z');
const REACTIVATED_AT = new Date('2026-11-05T10:00:00.000Z');
const CLOSE = {
  tenantId: TENANT_ID,
  suspendedAt: SUSPENDED_AT,
  reactivatedAt: REACTIVATED_AT,
  correlationId: 'corr-1',
};

describe('CloseTenantExpiryPauseUseCase', () => {
  let pauseRepo: InMemoryTenantExpiryPauseRepository;
  let close: CloseTenantExpiryPauseUseCase;
  let open: RecordTenantExpiryPauseUseCase;

  beforeEach(() => {
    pauseRepo = new InMemoryTenantExpiryPauseRepository();
    close = new CloseTenantExpiryPauseUseCase(pauseRepo);
    open = new RecordTenantExpiryPauseUseCase(pauseRepo);
  });

  it('closes the pause the suspend event opened', async () => {
    await open.execute({ tenantId: TENANT_ID, suspendedAt: SUSPENDED_AT, correlationId: 'c' });

    await close.execute(CLOSE);

    expect(pauseRepo.rows).toEqual([
      { tenantId: TENANT_ID, pausedAt: SUSPENDED_AT, resumedAt: REACTIVATED_AT },
    ]);
  });

  it('leaves one closed pause when the reactivation arrives before its suspension', async () => {
    await close.execute(CLOSE);
    await open.execute({ tenantId: TENANT_ID, suspendedAt: SUSPENDED_AT, correlationId: 'c' });

    expect(pauseRepo.rows).toEqual([
      { tenantId: TENANT_ID, pausedAt: SUSPENDED_AT, resumedAt: REACTIVATED_AT },
    ]);
  });

  it('changes nothing the second time the same event is delivered', async () => {
    await close.execute(CLOSE);
    await close.execute(CLOSE);

    expect(pauseRepo.rows).toHaveLength(1);
    expect(pauseRepo.rows[0].resumedAt).toEqual(REACTIVATED_AT);
  });

  it('closes only the tenant it was called for when two tenants share the same suspension instant', async () => {
    const otherTenant = '00000000-0000-7000-8000-000000000002';
    await open.execute({ tenantId: TENANT_ID, suspendedAt: SUSPENDED_AT, correlationId: 'c' });

    await close.execute({ ...CLOSE, tenantId: otherTenant });

    expect(pauseRepo.rows).toEqual([
      { tenantId: TENANT_ID, pausedAt: SUSPENDED_AT, resumedAt: null },
      { tenantId: otherTenant, pausedAt: SUSPENDED_AT, resumedAt: REACTIVATED_AT },
    ]);
  });
});
