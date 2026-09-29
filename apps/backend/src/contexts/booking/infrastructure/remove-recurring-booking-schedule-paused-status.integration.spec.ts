import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../test/test-datasource';
import {
  RecurringBookingScheduleEntityBuilder,
  ServiceEntityBuilder,
} from '../../../test/builders/booking/index';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { ServiceEntity } from './entities/service.entity';
import { RecurringBookingScheduleEntity } from './entities/recurring-booking-schedule.entity';
import { RemoveRecurringBookingSchedulePausedStatus1748500000019 } from './migrations/1748500000019-RemoveRecurringBookingSchedulePausedStatus';

// integration-global-setup.ts already ran this migration once, up front, so the shared datasource's
// constraint no longer knows PAUSED. To exercise the backfill this spec first rolls the constraint
// back with down() (re-allowing PAUSED), seeds PAUSED rows by raw SQL (the entity builder's status
// type no longer includes it), then re-runs up() and asserts on the result. Its own two tenants, so
// the assertions never see another spec's rows.
const TENANT_A = '00000000-1119-7000-8000-000000000001';
const TENANT_B = '00000000-1119-7000-8000-000000000002';
const SERVICE_A = '00000000-1119-7000-8000-000000000011';
const SERVICE_B = '00000000-1119-7000-8000-000000000012';
const TENANT_IDS = [TENANT_A, TENANT_B];

describe('RemoveRecurringBookingSchedulePausedStatus1748500000019 (integration)', () => {
  let ds: DataSource;
  let migration: RemoveRecurringBookingSchedulePausedStatus1748500000019;

  async function cleanupFixtures(): Promise<void> {
    await ds.query(
      `DELETE FROM "booking"."recurring_booking_schedules" WHERE "tenant_id" = ANY($1)`,
      [TENANT_IDS],
    );
    await ds.query(`DELETE FROM "booking"."services" WHERE "tenant_id" = ANY($1)`, [TENANT_IDS]);
  }

  async function run(direction: 'up' | 'down'): Promise<void> {
    const queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    try {
      await migration[direction](queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  async function insertPaused(tenantId: string, serviceId: string): Promise<string> {
    const template = new RecurringBookingScheduleEntityBuilder()
      .withTenantId(tenantId)
      .withServiceId(serviceId)
      .build();
    await ds.getRepository(RecurringBookingScheduleEntity).save(template);
    await ds.query(
      `UPDATE "booking"."recurring_booking_schedules" SET "status" = 'PAUSED' WHERE "id" = $1`,
      [template.id],
    );
    return template.id;
  }

  async function rowOf(
    id: string,
  ): Promise<{ status: string; cancellation_reason: string | null }> {
    const rows = await ds.query(
      `SELECT "status", "cancellation_reason" FROM "booking"."recurring_booking_schedules" WHERE "id" = $1`,
      [id],
    );
    return rows[0];
  }

  beforeAll(async () => {
    ds = await createTestDataSource();
    migration = new RemoveRecurringBookingSchedulePausedStatus1748500000019();
    await cleanupFixtures();
    await ds
      .getRepository(ServiceEntity)
      .save([
        new ServiceEntityBuilder().withId(SERVICE_A).withTenantId(TENANT_A).build(),
        new ServiceEntityBuilder().withId(SERVICE_B).withTenantId(TENANT_B).build(),
      ]);
  });

  afterAll(async () => {
    try {
      // up() is idempotent (backfill, then drop and re-add the constraint), so re-running it
      // restores the migrated schema whatever point a failed test stopped at after run('down') —
      // the shared datasource must never leak the PAUSED-accepting constraint into other suites.
      await run('up');
    } finally {
      try {
        await cleanupFixtures();
      } finally {
        await ds.destroy();
      }
    }
  });

  it('turns a PAUSED row into CANCELLED / CUSTOMER_CANCELLED and leaves other tenants and statuses alone', async () => {
    await run('down');
    const pausedA = await insertPaused(TENANT_A, SERVICE_A);
    const pausedB = await insertPaused(TENANT_B, SERVICE_B);
    const active = new RecurringBookingScheduleEntityBuilder()
      .withTenantId(TENANT_A)
      .withServiceId(SERVICE_A)
      .withStatus('ACTIVE')
      .build();
    await ds.getRepository(RecurringBookingScheduleEntity).save(active);

    await run('up');

    expect(await rowOf(pausedA)).toEqual({
      status: 'CANCELLED',
      cancellation_reason: 'CUSTOMER_CANCELLED',
    });
    expect(await rowOf(pausedB)).toEqual({
      status: 'CANCELLED',
      cancellation_reason: 'CUSTOMER_CANCELLED',
    });
    expect(await rowOf(active.id)).toEqual({ status: 'ACTIVE', cancellation_reason: null });
  });

  it('afterwards the status constraint rejects PAUSED', async () => {
    const id = uuidv7();
    await expect(
      ds.query(
        `INSERT INTO "booking"."recurring_booking_schedules"
           ("id", "tenant_id", "customer_id", "service_id", "recurrence", "starts_on", "ends_on",
            "status", "assignment_policy")
         VALUES ($1, $2, $3, $4, '{}'::jsonb, '2026-10-01', '2026-11-01', 'PAUSED', 'FIXED_ASSIGNMENT')`,
        [id, TENANT_A, uuidv7(), SERVICE_A],
      ),
    ).rejects.toThrow(/CHK_booking_rbs_status/);
  });

  it('down() re-allows PAUSED and up() takes it away again', async () => {
    await run('down');
    const id = await insertPaused(TENANT_A, SERVICE_A);
    expect((await rowOf(id)).status).toBe('PAUSED');

    await run('up');

    expect((await rowOf(id)).status).toBe('CANCELLED');
  });
});
