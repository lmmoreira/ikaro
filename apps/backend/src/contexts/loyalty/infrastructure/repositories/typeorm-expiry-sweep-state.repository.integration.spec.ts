import { DataSource } from 'typeorm';
import { ExpirySweepStateEntityBuilder } from '../../../../test/builders/loyalty/index';
import { createTestDataSource } from '../../../../test/test-datasource';
import { ExpirySweepStateEntity } from '../entities/expiry-sweep-state.entity';
import {
  EXPIRY_SWEEP_JOB_NAME,
  TypeOrmExpirySweepStateRepository,
} from './typeorm-expiry-sweep-state.repository';

// loyalty.expiry_sweep_state holds the sweep's one global watermark row, so this is the only suite
// that touches the real table: every other spec that runs the sweep uses the in-memory double. The row is deleted before
// and after each test so a reused database never carries a watermark into another run.
describe('TypeOrmExpirySweepStateRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmExpirySweepStateRepository;

  const clearRow = (): Promise<unknown> =>
    dataSource.query(`DELETE FROM "loyalty"."expiry_sweep_state"`);

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmExpirySweepStateRepository(dataSource.getRepository(ExpirySweepStateEntity));
  });

  beforeEach(clearRow);
  afterEach(clearRow);

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('has no watermark before the first run', async () => {
    expect(await repo.getProcessedThrough()).toBeNull();
  });

  it('stores the first watermark', async () => {
    const first = new Date('2031-06-01T02:00:00.000Z');

    await repo.advanceTo(first);

    expect(await repo.getProcessedThrough()).toEqual(first);
  });

  it('moves the watermark forward', async () => {
    await repo.advanceTo(new Date('2031-06-01T02:00:00.000Z'));
    const later = new Date('2031-06-02T02:00:00.000Z');

    await repo.advanceTo(later);

    expect(await repo.getProcessedThrough()).toEqual(later);
  });

  it('never moves the watermark backwards', async () => {
    const later = new Date('2031-06-02T02:00:00.000Z');
    await repo.advanceTo(later);

    await repo.advanceTo(new Date('2031-06-01T02:00:00.000Z'));

    expect(await repo.getProcessedThrough()).toEqual(later);
  });

  it('keeps a single row for the job however many times it advances', async () => {
    await repo.advanceTo(new Date('2031-06-01T02:00:00.000Z'));
    await repo.advanceTo(new Date('2031-06-02T02:00:00.000Z'));

    const [{ count }] = await dataSource.query<{ count: string }[]>(
      `SELECT count(*) FROM "loyalty"."expiry_sweep_state" WHERE job_name = $1`,
      [EXPIRY_SWEEP_JOB_NAME],
    );
    expect(Number(count)).toBe(1);
  });

  it("does not read another job's row as the sweep's watermark", async () => {
    await dataSource
      .getRepository(ExpirySweepStateEntity)
      .insert(
        new ExpirySweepStateEntityBuilder()
          .withJobName('some-other-job')
          .withProcessedThrough(new Date('2031-06-05T02:00:00.000Z'))
          .build(),
      );

    expect(await repo.getProcessedThrough()).toBeNull();
  });

  it('resets to a full rescan when the row is deleted', async () => {
    await repo.advanceTo(new Date('2031-06-01T02:00:00.000Z'));

    await clearRow();

    expect(await repo.getProcessedThrough()).toBeNull();
  });
});
