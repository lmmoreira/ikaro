import { Repository } from 'typeorm';
import { TenantExpiryPauseEntityBuilder } from '../../../../test/builders/loyalty/index';
import { TenantExpiryPauseEntity } from '../entities/tenant-expiry-pause.entity';
import { TypeOrmTenantExpiryPauseRepository } from './typeorm-tenant-expiry-pause.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const PAUSED_AT = new Date('2026-11-01T10:00:00.000Z');
const RESUMED_AT = new Date('2026-11-05T10:00:00.000Z');

describe('TypeOrmTenantExpiryPauseRepository', () => {
  let ormRepo: { find: jest.Mock; createQueryBuilder: jest.Mock };
  let qb: Record<string, jest.Mock>;
  let repo: TypeOrmTenantExpiryPauseRepository;

  beforeEach(() => {
    qb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      orUpdate: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    ormRepo = { find: jest.fn(), createQueryBuilder: jest.fn().mockReturnValue(qb) };
    repo = new TypeOrmTenantExpiryPauseRepository(
      ormRepo as unknown as Repository<TenantExpiryPauseEntity>,
    );
  });

  it('opens a pause with an insert that ignores an existing span', async () => {
    await repo.recordOpen(TENANT_ID, PAUSED_AT);

    expect(qb.values).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      pausedAt: PAUSED_AT,
      resumedAt: null,
    });
    expect(qb.orIgnore).toHaveBeenCalled();
    expect(qb.execute).toHaveBeenCalled();
  });

  it('closes a pause with an upsert on the span key, using real column names', async () => {
    await repo.recordClosed(TENANT_ID, PAUSED_AT, RESUMED_AT);

    expect(qb.values).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      pausedAt: PAUSED_AT,
      resumedAt: RESUMED_AT,
    });
    expect(qb.orUpdate).toHaveBeenCalledWith(['resumed_at'], ['tenant_id', 'paused_at']);
  });

  it('groups the pauses of the requested tenants by tenant id', async () => {
    ormRepo.find.mockResolvedValue([
      new TenantExpiryPauseEntityBuilder()
        .withTenantId(TENANT_ID)
        .withPausedAt(PAUSED_AT)
        .withResumedAt(RESUMED_AT)
        .build(),
      new TenantExpiryPauseEntityBuilder().withTenantId(TENANT_ID).withPausedAt(RESUMED_AT).build(),
    ]);

    const result = await repo.findByTenantIds([TENANT_ID]);

    expect(result.get(TENANT_ID)).toEqual([
      { pausedAt: PAUSED_AT, resumedAt: RESUMED_AT },
      { pausedAt: RESUMED_AT, resumedAt: null },
    ]);
  });

  it('does not query when no tenant is requested', async () => {
    expect((await repo.findByTenantIds([])).size).toBe(0);
    expect(ormRepo.find).not.toHaveBeenCalled();
  });
});
