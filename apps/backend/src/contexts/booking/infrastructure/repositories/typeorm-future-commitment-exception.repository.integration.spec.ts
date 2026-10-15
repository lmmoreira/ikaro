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

// Polls until some backend is parked on a row lock, pausing inside Postgres (pg_sleep) so no
// test-side timer is involved. Bounded: a lock wait that never appears fails the test instead of
// hanging it.
async function waitForBlockedRowLock(dataSource: DataSource): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt++) {
    const [{ waiting }] = await dataSource.query<{ waiting: number }[]>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (waiting > 0) return;
    await dataSource.query('SELECT pg_sleep(0.01)');
  }
  throw new Error('no transaction ever blocked on the row lock');
}

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

  describe('findByTenant for one booking (M23-S46)', () => {
    it('returns only the OPEN entries of that booking, scoped by tenant', async () => {
      const bookingId = uuidv7();
      const first = new FutureCommitmentExceptionBuilder()
        .withTenantId(TENANT_A)
        .withAffectedId(bookingId)
        .build();
      const second = new FutureCommitmentExceptionBuilder()
        .withTenantId(TENANT_A)
        .withAffectedId(bookingId)
        .build();
      const closed = new FutureCommitmentExceptionBuilder()
        .withTenantId(TENANT_A)
        .withAffectedId(bookingId)
        .build();
      await save(first);
      await save(second);
      await save(closed);
      closed.dismiss(STAFF_ID, 'x', 'corr-1');
      await save(closed);
      await save(new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build());
      await save(
        new FutureCommitmentExceptionBuilder()
          .withTenantId(TENANT_B)
          .withAffectedId(bookingId)
          .build(),
      );

      const found = await repo.findByTenant(TENANT_A, {
        status: 'OPEN',
        affectedType: 'BOOKING',
        affectedId: bookingId,
      });

      expect(found.map((e) => e.id).sort()).toEqual([first.id, second.id].sort());
    });
  });

  describe('findOpenAffectedBookingIds (M23-S46)', () => {
    it('returns only bookings with an OPEN BOOKING entry, tenant-scoped', async () => {
      const marked = uuidv7();
      const resolved = uuidv7();
      const plain = uuidv7();
      await save(
        new FutureCommitmentExceptionBuilder()
          .withTenantId(TENANT_A)
          .withAffectedId(marked)
          .build(),
      );
      const closed = new FutureCommitmentExceptionBuilder()
        .withTenantId(TENANT_A)
        .withAffectedId(resolved)
        .build();
      await save(closed);
      closed.dismiss(STAFF_ID, 'x', 'corr-1');
      await save(closed);

      const ids = await repo.findOpenAffectedBookingIds(TENANT_A, [marked, resolved, plain]);

      expect([...ids]).toEqual([marked]);
    });

    it('never sees another tenant’s entry, and an empty input returns an empty set', async () => {
      const bookingId = uuidv7();
      await save(
        new FutureCommitmentExceptionBuilder()
          .withTenantId(TENANT_A)
          .withAffectedId(bookingId)
          .build(),
      );

      expect((await repo.findOpenAffectedBookingIds(TENANT_B, [bookingId])).size).toBe(0);
      expect((await repo.findOpenAffectedBookingIds(TENANT_A, [])).size).toBe(0);
    });

    // The marker is looked up for every queue page, so it must be answered from an index, never by
    // reading every historical row of the tenant. seqscan is switched off for the transaction
    // because a tiny test table would otherwise (rightly) be scanned: the point is that a usable
    // index EXISTS for the exact predicate the repository issues.
    it('is answered from an index, not a sequential scan', async () => {
      await save(new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build());
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.startTransaction();
        await runner.query('SET LOCAL enable_seqscan = off');
        const plan = (await runner.query(
          `EXPLAIN SELECT affected_id FROM booking.future_commitment_exceptions
            WHERE tenant_id = $1 AND status = 'OPEN' AND affected_type = 'BOOKING'
              AND affected_id = ANY($2::uuid[])`,
          [TENANT_A, [uuidv7(), uuidv7()]],
        )) as { 'QUERY PLAN': string }[];
        await runner.rollbackTransaction();

        const text = plan.map((row) => row['QUERY PLAN']).join('\n');
        expect(text).not.toContain('Seq Scan');
        expect(text).toMatch(/IDX_booking_fce_tenant_affected|UQ_booking_fce_open_impact/);
      } finally {
        await runner.release();
      }
    });
  });

  describe('countByTenant', () => {
    it('counts only the tenant’s rows in the given status', async () => {
      await save(new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build());
      await save(new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build());
      const closed = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build();
      await save(closed);
      closed.dismiss(STAFF_ID, 'x', 'corr-1');
      await save(closed);
      await save(new FutureCommitmentExceptionBuilder().withTenantId(TENANT_B).build());

      expect(await repo.countByTenant(TENANT_A, { status: 'OPEN' })).toBe(2);
      expect(await repo.countByTenant(TENANT_A)).toBe(3);
      expect(await repo.countByTenant(TENANT_B, { status: 'OPEN' })).toBe(1);
    });

    // The sidebar badge runs this on every dashboard page, so it must be answered from an index and
    // never by reading every historical row of the tenant. The partial unique index over the OPEN
    // rows (tenant_id first) serves it. seqscan is switched off for the transaction because a tiny
    // test table would otherwise (rightly) be scanned: the point is that a usable index EXISTS.
    it('is answered from the partial index over the OPEN rows', async () => {
      await save(new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build());
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      try {
        await runner.startTransaction();
        await runner.query('SET LOCAL enable_seqscan = off');
        const plan = (await runner.query(
          'EXPLAIN SELECT COUNT(1) FROM booking.future_commitment_exceptions WHERE tenant_id = $1 AND status = $2',
          [TENANT_A, 'OPEN'],
        )) as { 'QUERY PLAN': string }[];
        await runner.rollbackTransaction();

        const text = plan.map((row) => row['QUERY PLAN']).join('\n');
        expect(text).toContain('Index Only Scan');
        expect(text).toContain('UQ_booking_fce_open_impact');
      } finally {
        await runner.release();
      }
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

  describe('findOpenBySourceForUpdate', () => {
    const SOURCE_ID = uuidv7();

    it('refuses to run outside a transaction', async () => {
      await expect(
        repo.findOpenBySourceForUpdate(TENANT_A, 'RESOURCE_DEACTIVATION', SOURCE_ID),
      ).rejects.toThrow('active transaction');
    });

    it('returns only the OPEN rows of that source and tenant, ordered by id', async () => {
      const open = [
        new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).withSourceId(SOURCE_ID),
        new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).withSourceId(SOURCE_ID),
        new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).withSourceId(SOURCE_ID),
      ].map((b) => b.build());
      const dismissed = new FutureCommitmentExceptionBuilder()
        .withTenantId(TENANT_A)
        .withSourceId(SOURCE_ID)
        .build();
      dismissed.dismiss(STAFF_ID, 'done', 'corr-1');
      const otherSource = new FutureCommitmentExceptionBuilder().withTenantId(TENANT_A).build();
      const otherTenant = new FutureCommitmentExceptionBuilder()
        .withTenantId(TENANT_B)
        .withSourceId(SOURCE_ID)
        .build();
      for (const e of [...open, dismissed, otherSource, otherTenant]) await save(e);

      const found = await txManager.run(() =>
        repo.findOpenBySourceForUpdate(TENANT_A, 'RESOURCE_DEACTIVATION', SOURCE_ID),
      );

      expect(found.map((e) => e.id)).toEqual(open.map((e) => e.id).sort());
    });

    it('serializes against a concurrent resolver: the entry is seen already closed once the resolver commits', async () => {
      const exception = new FutureCommitmentExceptionBuilder()
        .withTenantId(TENANT_A)
        .withSourceId(SOURCE_ID)
        .build();
      await save(exception);
      const order: string[] = [];
      let resolverHasLock!: () => void;
      const resolverLocked = new Promise<void>((resolve) => (resolverHasLock = resolve));
      let releaseResolver!: () => void;
      const resolverReleased = new Promise<void>((resolve) => (releaseResolver = resolve));

      const resolver = txManager.run(async () => {
        const locked = (await repo.findByIdForUpdate(exception.id, TENANT_A))!;
        order.push('resolver-locked');
        resolverHasLock();
        await resolverReleased;
        locked.resolve(STAFF_ID, 'KEEP', null, 'corr-1');
        await repo.save(locked);
        order.push('resolver-committing');
      });
      await resolverLocked;
      const reactivation = txManager.run(async () => {
        const open = await repo.findOpenBySourceForUpdate(
          TENANT_A,
          'RESOURCE_DEACTIVATION',
          SOURCE_ID,
        );
        order.push(`reactivation-saw-${open.length}-open`);
      });
      await waitForBlockedRowLock(dataSource);
      releaseResolver();
      await Promise.all([resolver, reactivation]);

      expect(order).toEqual(['resolver-locked', 'resolver-committing', 'reactivation-saw-0-open']);
    });

    it('leaves the entries OPEN when the transaction rolls back after closing them', async () => {
      const exception = new FutureCommitmentExceptionBuilder()
        .withTenantId(TENANT_A)
        .withSourceId(SOURCE_ID)
        .build();
      await save(exception);

      await expect(
        txManager.run(async () => {
          const [entry] = await repo.findOpenBySourceForUpdate(
            TENANT_A,
            'RESOURCE_DEACTIVATION',
            SOURCE_ID,
          );
          entry.dismiss(STAFF_ID, 'RESOURCE_REACTIVATED', 'corr-rollback');
          await repo.save(entry);
          throw new Error('forced failure after the close');
        }),
      ).rejects.toThrow('forced failure');

      const reloaded = (await repo.findById(exception.id, TENANT_A))!;
      expect(reloaded.status).toBe('OPEN');
      expect(reloaded.resolutionReason).toBeNull();
    });
  });
});
