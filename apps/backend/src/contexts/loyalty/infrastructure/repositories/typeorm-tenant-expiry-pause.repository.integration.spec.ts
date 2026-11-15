import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { createTestDataSource } from '../../../../test/test-datasource';
import { TenantExpiryPauseEntityBuilder } from '../../../../test/builders/loyalty/index';
import { TenantExpiryPauseEntity } from '../entities/tenant-expiry-pause.entity';
import { TypeOrmTenantExpiryPauseRepository } from './typeorm-tenant-expiry-pause.repository';

const TENANT_A = uuidv7();
const TENANT_B = uuidv7();
const SUSPENDED_AT = new Date('2026-11-01T10:00:00.000Z');
const REACTIVATED_AT = new Date('2026-11-05T10:00:00.000Z');

describe('TypeOrmTenantExpiryPauseRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmTenantExpiryPauseRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmTenantExpiryPauseRepository(
      dataSource.getRepository(TenantExpiryPauseEntity),
    );
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  afterEach(async () => {
    await dataSource.query(
      `DELETE FROM "loyalty"."tenant_expiry_pauses" WHERE tenant_id IN ($1, $2)`,
      [TENANT_A, TENANT_B],
    );
  });

  const rowsOf = (tenantId: string) =>
    dataSource.query(
      `SELECT paused_at, resumed_at FROM "loyalty"."tenant_expiry_pauses" WHERE tenant_id = $1`,
      [tenantId],
    ) as Promise<{ paused_at: Date; resumed_at: Date | null }[]>;

  it('records an open pause, and a redelivered suspend event writes nothing', async () => {
    await repo.recordOpen(TENANT_A, SUSPENDED_AT);
    await repo.recordOpen(TENANT_A, SUSPENDED_AT);

    const rows = await rowsOf(TENANT_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].resumed_at).toBeNull();
  });

  it('closes the pause the suspend event opened, and a redelivered reactivation changes nothing', async () => {
    await repo.recordOpen(TENANT_A, SUSPENDED_AT);
    await repo.recordClosed(TENANT_A, SUSPENDED_AT, REACTIVATED_AT);
    await repo.recordClosed(TENANT_A, SUSPENDED_AT, REACTIVATED_AT);

    const rows = await rowsOf(TENANT_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].resumed_at).toEqual(REACTIVATED_AT);
  });

  it('leaves one closed pause when the reactivation arrives before the suspension, and the late suspend neither reopens nor duplicates it', async () => {
    await repo.recordClosed(TENANT_A, SUSPENDED_AT, REACTIVATED_AT);
    await repo.recordOpen(TENANT_A, SUSPENDED_AT);

    const rows = await rowsOf(TENANT_A);
    expect(rows).toHaveLength(1);
    expect(rows[0].resumed_at).toEqual(REACTIVATED_AT);
  });

  it('reads the pauses of the requested tenants only, grouped by tenant', async () => {
    await repo.recordOpen(TENANT_A, SUSPENDED_AT);
    await repo.recordClosed(
      TENANT_A,
      new Date('2026-12-01T00:00:00.000Z'),
      new Date('2026-12-03T00:00:00.000Z'),
    );
    await repo.recordOpen(TENANT_B, SUSPENDED_AT);

    const result = await repo.findByTenantIds([TENANT_A]);

    expect([...result.keys()]).toEqual([TENANT_A]);
    expect(result.get(TENANT_A)).toHaveLength(2);
  });

  it('answers an empty map for no tenants and for a tenant without pauses', async () => {
    expect((await repo.findByTenantIds([])).size).toBe(0);
    expect((await repo.findByTenantIds([uuidv7()])).size).toBe(0);
  });

  it('rejects a span that ends before it starts (CHECK constraint)', async () => {
    const entity = new TenantExpiryPauseEntityBuilder()
      .withTenantId(TENANT_A)
      .withPausedAt(REACTIVATED_AT)
      .withResumedAt(SUSPENDED_AT)
      .build();

    await expect(dataSource.getRepository(TenantExpiryPauseEntity).insert(entity)).rejects.toThrow(
      /CHK_loyalty_tenant_expiry_pauses_span/,
    );
  });
});
