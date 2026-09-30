import { DataSource } from 'typeorm';
import { FutureCommitmentExceptionBuilder } from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { createTestDataSource } from '../../../../test/test-datasource';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { FutureCommitmentExceptionEntity } from '../entities/future-commitment-exception.entity';
import { TypeOrmFutureCommitmentExceptionRepository } from './typeorm-future-commitment-exception.repository';

const TENANT_A = uuidv7();
const TENANT_B = uuidv7();
const STAFF_ID = uuidv7();

describe('TypeOrmFutureCommitmentExceptionRepository (integration)', () => {
  let dataSource: DataSource;
  let txManager: TypeOrmTransactionManager;
  let repo: TypeOrmFutureCommitmentExceptionRepository;
  let outbox: InMemoryEventBus;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    txManager = new TypeOrmTransactionManager(dataSource);
    outbox = new InMemoryEventBus();
    repo = new TypeOrmFutureCommitmentExceptionRepository(
      dataSource.getRepository(FutureCommitmentExceptionEntity),
      outbox,
    );
  });

  afterEach(async () => {
    await dataSource.getRepository(FutureCommitmentExceptionEntity).delete({ tenantId: TENANT_A });
    await dataSource.getRepository(FutureCommitmentExceptionEntity).delete({ tenantId: TENANT_B });
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  const save = (exception: ReturnType<FutureCommitmentExceptionBuilder['build']>) =>
    txManager.run(() => repo.save(exception));

  it('round-trips an entry including its JSONB alternatives', async () => {
    const exception = new FutureCommitmentExceptionBuilder()
      .withTenantId(TENANT_A)
      .withAlternatives([
        { resourceId: uuidv7(), resourceName: 'Sala 2' },
        { resourceId: uuidv7(), resourceName: 'Sala 3' },
      ])
      .build();

    await save(exception);

    const loaded = (await repo.findById(exception.id, TENANT_A))!;
    expect(loaded).toMatchObject({
      id: exception.id,
      sourceType: 'RESOURCE_DEACTIVATION',
      affectedType: 'BOOKING',
      status: 'OPEN',
      ownerStaffId: null,
    });
    expect(loaded.alternatives).toEqual(exception.alternatives);
    expect(loaded.createdAt).toBeInstanceOf(Date);
  });

  it('persists a resolution and a dismissal', async () => {
    const resolved = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build();
    const dismissed = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build();
    await save(resolved);
    await save(dismissed);

    resolved.resolve(STAFF_ID, 'REASSIGN', 'moved', 'corr-1');
    dismissed.dismiss(STAFF_ID, 'handled', 'corr-1');
    await save(resolved);
    await save(dismissed);

    expect(await repo.findById(resolved.id, TENANT_A)).toMatchObject({
      status: 'RESOLVED',
      resolutionType: 'REASSIGN',
      resolutionReason: 'moved',
      resolvedByStaffId: STAFF_ID,
    });
    expect(await repo.findById(dismissed.id, TENANT_A)).toMatchObject({
      status: 'DISMISSED',
      resolutionType: null,
      resolutionReason: 'handled',
    });
  });

  it('drains the aggregate events to the outbox in the same save', async () => {
    const exception = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build();
    const publish = jest.spyOn(outbox, 'publish');

    await save(exception);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0]).toMatchObject({
      eventName: 'FutureCommitmentExceptionRaised',
    });
    publish.mockRestore();
  });

  describe('findOpenByImpact and the partial unique index', () => {
    const impact = {
      sourceType: 'RESOURCE_DEACTIVATION' as const,
      sourceId: uuidv7(),
      affectedType: 'BOOKING' as const,
      affectedId: uuidv7(),
    };

    const build = (tenantId = TENANT_A) =>
      new FutureCommitmentExceptionBuilder()
        .withTenantId(tenantId)
        .withSourceId(impact.sourceId)
        .withAffectedId(impact.affectedId)
        .build();

    it('finds only the still-OPEN entry of the exact impact', async () => {
      const exception = build();
      await save(exception);

      expect((await repo.findOpenByImpact(TENANT_A, impact))?.id).toBe(exception.id);
      expect(await repo.findOpenByImpact(TENANT_A, { ...impact, affectedId: uuidv7() })).toBeNull();
      expect(await repo.findOpenByImpact(TENANT_B, impact)).toBeNull();
    });

    it('rejects a second OPEN entry for the same impact at the database', async () => {
      await save(build());

      await expect(save(build())).rejects.toThrow(/UQ_booking_fce_open_impact/);
    });

    it('allows a new OPEN entry once the earlier one is closed, and the same impact in another tenant', async () => {
      const first = build();
      await save(first);
      first.dismiss(STAFF_ID, 'handled', 'corr-1');
      await save(first);

      await expect(save(build())).resolves.toBeUndefined();
      await expect(save(build(TENANT_B))).resolves.toBeUndefined();
    });

    it('sees an entry written earlier in the same transaction', async () => {
      const exception = build();

      const found = await txManager.run(async () => {
        await repo.save(exception);
        return repo.findOpenByImpact(TENANT_A, impact);
      });

      expect(found?.id).toBe(exception.id);
    });
  });

  describe('findByTenant', () => {
    it('filters by status, scopes by tenant and orders newest first', async () => {
      const older = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build();
      await save(older);
      const newer = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build();
      await save(newer);
      const closed = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build();
      await save(closed);
      closed.dismiss(STAFF_ID, 'x', 'corr-1');
      await save(closed);
      await save(new FutureCommitmentExceptionBuilder().withTenantId(TENANT_B).build());

      const open = await repo.findByTenant(TENANT_A, { status: 'OPEN' });
      const all = await repo.findByTenant(TENANT_A);

      expect(open.map((e) => e.id).sort()).toEqual([older.id, newer.id].sort());
      expect(all).toHaveLength(3);
      expect(all.every((e) => e.tenantId === TENANT_A)).toBe(true);
    });
  });

  describe('findByIdForUpdate', () => {
    it('refuses to run outside a transaction', async () => {
      await expect(repo.findByIdForUpdate(uuidv7(), TENANT_A)).rejects.toThrow(
        'active transaction',
      );
    });

    it('serializes two transactions on the same row: the second waits for the first to commit', async () => {
      const exception = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build();
      await save(exception);
      const order: string[] = [];

      const first = txManager.run(async () => {
        const locked = (await repo.findByIdForUpdate(exception.id, TENANT_A))!;
        order.push('first-locked');
        await new Promise((resolve) => setTimeout(resolve, 150));
        locked.resolve(STAFF_ID, 'KEEP', null, 'corr-1');
        await repo.save(locked);
        order.push('first-committing');
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      const second = txManager.run(async () => {
        const locked = (await repo.findByIdForUpdate(exception.id, TENANT_A))!;
        order.push(`second-saw-${locked.status}`);
      });
      await Promise.all([first, second]);

      expect(order).toEqual(['first-locked', 'first-committing', 'second-saw-RESOLVED']);
    });

    it('returns null for an entry of another tenant', async () => {
      const exception = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build();
      await save(exception);

      const found = await txManager.run(() => repo.findByIdForUpdate(exception.id, TENANT_B));

      expect(found).toBeNull();
    });
  });
});
