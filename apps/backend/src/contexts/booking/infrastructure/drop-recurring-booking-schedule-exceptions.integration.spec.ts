import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../test/test-datasource';
import { DropRecurringBookingScheduleExceptions1748500000021 } from './migrations/1748500000021-DropRecurringBookingScheduleExceptions';

// integration-global-setup.ts already ran this migration once, up front, so the table is already
// gone for the shared datasource. The round-trip spec below rolls it back with down() and drops it
// again with up(), leaving the shared datasource exactly as it found it.
const TABLE = 'recurring_booking_schedule_exceptions';

describe('DropRecurringBookingScheduleExceptions1748500000021 (integration)', () => {
  let ds: DataSource;
  let migration: DropRecurringBookingScheduleExceptions1748500000021;

  async function run(direction: 'up' | 'down'): Promise<void> {
    const queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    try {
      await migration[direction](queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  async function tableExists(): Promise<boolean> {
    const rows = await ds.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'booking' AND table_name = $1`,
      [TABLE],
    );
    return rows.length > 0;
  }

  async function constraintNames(): Promise<string[]> {
    const rows: { conname: string }[] = await ds.query(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'booking.${TABLE}'::regclass`,
    );
    return rows.map((r) => r.conname).sort((a, b) => a.localeCompare(b));
  }

  beforeAll(async () => {
    ds = await createTestDataSource();
    migration = new DropRecurringBookingScheduleExceptions1748500000021();
  });

  afterAll(async () => {
    try {
      if (await tableExists()) await run('up');
    } finally {
      await ds.destroy();
    }
  });

  it('leaves no recurring_booking_schedule_exceptions table once the migrations have run', async () => {
    expect(await tableExists()).toBe(false);
  });

  it('down() recreates the table with its FKs and CHECKs, and up() drops it again', async () => {
    await run('down');
    expect(await tableExists()).toBe(true);
    expect(await constraintNames()).toEqual([
      'CHK_booking_rbs_exceptions_kind',
      'CHK_booking_rbs_exceptions_replacement',
      'FK_booking_rbs_exceptions_replacement_booking',
      'FK_booking_rbs_exceptions_schedule',
      'PK_booking_rbs_exceptions',
    ]);
    const indexes = await ds.query(
      `SELECT 1 FROM pg_indexes WHERE schemaname = 'booking' AND indexname = 'UQ_booking_rbs_exceptions_schedule_occurrence'`,
    );
    expect(indexes).toHaveLength(1);

    await run('up');
    expect(await tableExists()).toBe(false);
  });
});
