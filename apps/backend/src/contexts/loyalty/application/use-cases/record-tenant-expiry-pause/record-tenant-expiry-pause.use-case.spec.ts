import { InMemoryTenantExpiryPauseRepository } from '../../../../../test/repositories/loyalty/in-memory-tenant-expiry-pause.repository';
import { RecordTenantExpiryPauseUseCase } from './record-tenant-expiry-pause.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const SUSPENDED_AT = new Date('2026-11-01T10:00:00.000Z');
const INPUT = { tenantId: TENANT_ID, suspendedAt: SUSPENDED_AT, correlationId: 'corr-1' };

describe('RecordTenantExpiryPauseUseCase', () => {
  let pauseRepo: InMemoryTenantExpiryPauseRepository;
  let useCase: RecordTenantExpiryPauseUseCase;

  beforeEach(() => {
    pauseRepo = new InMemoryTenantExpiryPauseRepository();
    useCase = new RecordTenantExpiryPauseUseCase(pauseRepo);
  });

  it('opens a pause keyed by the suspension start', async () => {
    await useCase.execute(INPUT);

    expect(pauseRepo.rows).toEqual([
      { tenantId: TENANT_ID, pausedAt: SUSPENDED_AT, resumedAt: null },
    ]);
  });

  it('writes nothing the second time the same event is delivered', async () => {
    await useCase.execute(INPUT);
    await useCase.execute(INPUT);

    expect(pauseRepo.rows).toHaveLength(1);
  });

  it('keeps one pause per suspension span', async () => {
    await useCase.execute(INPUT);
    await useCase.execute({ ...INPUT, suspendedAt: new Date('2026-12-01T10:00:00.000Z') });

    expect(pauseRepo.rows).toHaveLength(2);
  });

  it('keeps two tenants suspended at the same instant as two separate pauses', async () => {
    const otherTenant = '00000000-0000-7000-8000-000000000002';

    await useCase.execute(INPUT);
    await useCase.execute({ ...INPUT, tenantId: otherTenant });

    expect(pauseRepo.rows).toEqual([
      { tenantId: TENANT_ID, pausedAt: SUSPENDED_AT, resumedAt: null },
      { tenantId: otherTenant, pausedAt: SUSPENDED_AT, resumedAt: null },
    ]);
  });
});
