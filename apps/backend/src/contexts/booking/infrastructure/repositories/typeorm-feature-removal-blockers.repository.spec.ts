import { DataSource } from 'typeorm';
import {
  FEATURE_REMOVAL_BOOKING_BLOCKERS_SQL,
  FEATURE_REMOVAL_SCHEDULE_BLOCKERS_SQL,
  TypeOrmFeatureRemovalBlockersRepository,
} from './typeorm-feature-removal-blockers.repository';

const TENANT = '10000000-0000-4000-8000-0000000018e1';

// A hand-written stand-in for the one DataSource call the adapter makes: it records the statement
// and its parameters and answers with the rows a spec hands it. The statements themselves are
// pinned against real Postgres in the integration spec.
class RecordingDataSource {
  readonly calls: Array<{ sql: string; params: unknown[] }> = [];

  constructor(private readonly rows: unknown[]) {}

  query(sql: string, params: unknown[]): Promise<unknown[]> {
    this.calls.push({ sql, params });
    return Promise.resolve(this.rows);
  }
}

const repoWith = (dataSource: RecordingDataSource): TypeOrmFeatureRemovalBlockersRepository =>
  new TypeOrmFeatureRemovalBlockersRepository(dataSource as unknown as DataSource);

describe('TypeOrmFeatureRemovalBlockersRepository', () => {
  describe('findBookingsEndingAfter()', () => {
    it('maps the rows to ids and end instants, and reads the total from the first row as a number', async () => {
      const endsAt = new Date('2026-12-16T12:00:00.000Z');
      const dataSource = new RecordingDataSource([
        { id: 'b-1', scheduled_end_at: endsAt, total: '7' },
        { id: 'b-2', scheduled_end_at: endsAt, total: '7' },
      ]);

      const page = await repoWith(dataSource).findBookingsEndingAfter(
        TENANT,
        new Date('2026-12-15T03:00:00.000Z'),
        '2026-12-15',
        2,
      );

      expect(page).toEqual({
        total: 7,
        sample: [
          { id: 'b-1', scheduledEndAt: endsAt },
          { id: 'b-2', scheduledEndAt: endsAt },
        ],
      });
    });

    it('answers a total of zero and an empty sample when no row comes back', async () => {
      const page = await repoWith(new RecordingDataSource([])).findBookingsEndingAfter(
        TENANT,
        new Date(),
        '2026-12-15',
        10,
      );

      expect(page).toEqual({ total: 0, sample: [] });
    });

    it('sends the tenant first, the three live statuses, the instant, the counted schedule statuses, the effective date and the limit', async () => {
      const dataSource = new RecordingDataSource([]);
      const endsAfter = new Date('2026-12-15T03:00:00.000Z');

      await repoWith(dataSource).findBookingsEndingAfter(TENANT, endsAfter, '2026-12-15', 10);

      expect(dataSource.calls).toEqual([
        {
          sql: FEATURE_REMOVAL_BOOKING_BLOCKERS_SQL,
          params: [
            TENANT,
            ['PENDING', 'INFO_REQUESTED', 'APPROVED'],
            endsAfter,
            ['PENDING_APPROVAL', 'ACTIVE'],
            '2026-12-15',
            10,
          ],
        },
      ]);
    });
  });

  describe('findSchedulesEndingOnOrAfter()', () => {
    it('maps the rows to ids and last days, and reads the total from the first row as a number', async () => {
      const dataSource = new RecordingDataSource([
        { id: 's-1', ends_on: '2026-12-20', total: '3' },
        { id: 's-2', ends_on: '2026-12-21', total: '3' },
      ]);

      const page = await repoWith(dataSource).findSchedulesEndingOnOrAfter(TENANT, '2026-12-15', 2);

      expect(page).toEqual({
        total: 3,
        sample: [
          { id: 's-1', endsOn: '2026-12-20' },
          { id: 's-2', endsOn: '2026-12-21' },
        ],
      });
    });

    it('answers a total of zero and an empty sample when no row comes back', async () => {
      const page = await repoWith(new RecordingDataSource([])).findSchedulesEndingOnOrAfter(
        TENANT,
        '2026-12-15',
        10,
      );

      expect(page).toEqual({ total: 0, sample: [] });
    });

    it('sends the tenant first, the counted statuses, the effective date and the limit', async () => {
      const dataSource = new RecordingDataSource([]);

      await repoWith(dataSource).findSchedulesEndingOnOrAfter(TENANT, '2026-12-15', 10);

      expect(dataSource.calls).toEqual([
        {
          sql: FEATURE_REMOVAL_SCHEDULE_BLOCKERS_SQL,
          params: [TENANT, ['PENDING_APPROVAL', 'ACTIVE'], '2026-12-15', 10],
        },
      ]);
    });
  });
});
