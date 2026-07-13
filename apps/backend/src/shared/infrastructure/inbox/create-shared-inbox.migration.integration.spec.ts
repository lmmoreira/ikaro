import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { CreateSharedInbox1748400000007 } from '../migrations/1748400000007-CreateSharedInbox';

// The shared Postgres container used by every other integration spec has already run this
// migration by the time any test file executes (integration-global-setup.ts runs the full
// migration history once, up front) — loyalty.processed_events/notification.processed_events are
// already dropped there. Proving the row-copy logic requires a throwaway database recreating just
// the pre-migration shape (the two old tables), isolated from the shared container's main
// database so this test never races other spec files' use of shared.inbox.
describe('CreateSharedInbox1748400000007 (migration, integration)', () => {
  let adminClient: Client;
  let ds: DataSource;
  const dbName = `migration_test_inbox_${randomUUID().replace(/-/g, '')}`;

  beforeAll(async () => {
    const baseUrl = process.env['TEST_DATABASE_URL'];
    if (!baseUrl) {
      throw new Error(
        'TEST_DATABASE_URL is not set. Run integration tests via: jest --selectProjects integration',
      );
    }

    adminClient = new Client({ connectionString: baseUrl });
    await adminClient.connect();
    await adminClient.query(`CREATE DATABASE "${dbName}"`);

    const dbUrl = new URL(baseUrl);
    dbUrl.pathname = `/${dbName}`;

    ds = new DataSource({ type: 'postgres', url: dbUrl.toString() });
    await ds.initialize();

    // Recreate exactly the pre-S04 shape: the two old dedup tables this migration replaces, plus
    // the "shared" schema the migration's INSERT ... shared.inbox target requires to exist.
    await ds.query(`CREATE SCHEMA IF NOT EXISTS "loyalty"`);
    await ds.query(`CREATE SCHEMA IF NOT EXISTS "notification"`);
    await ds.query(`CREATE SCHEMA IF NOT EXISTS "shared"`);
    await ds.query(`
      CREATE TABLE "loyalty"."processed_events" (
        "event_id"      UUID         NOT NULL,
        "consumer_name" VARCHAR(100) NOT NULL,
        "processed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_loyalty_processed_events" PRIMARY KEY ("event_id", "consumer_name")
      )
    `);
    await ds.query(`
      CREATE TABLE "notification"."processed_events" (
        "event_id"          UUID         NOT NULL,
        "notification_type" VARCHAR(100) NOT NULL,
        "channel"           VARCHAR(32)  NOT NULL,
        "processed_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_processed_events"
          PRIMARY KEY ("event_id", "notification_type", "channel")
      )
    `);
  });

  afterAll(async () => {
    await ds.destroy();
    await adminClient.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await adminClient.end();
  });

  it('copies loyalty rows verbatim and notification rows with a composed consumer_name, then drops both old tables', async () => {
    const loyaltyEventId = randomUUID();
    const loyaltyProcessedAt = new Date('2026-01-01T00:00:00.000Z');
    await ds.query(
      `INSERT INTO "loyalty"."processed_events" ("event_id", "consumer_name", "processed_at") VALUES ($1, $2, $3)`,
      [loyaltyEventId, 'BOOKING_COMPLETED_LOYALTY_EFFECTS', loyaltyProcessedAt],
    );

    const notificationEventId = randomUUID();
    const notificationProcessedAt = new Date('2026-01-02T00:00:00.000Z');
    await ds.query(
      `INSERT INTO "notification"."processed_events" ("event_id", "notification_type", "channel", "processed_at") VALUES ($1, $2, $3, $4)`,
      [notificationEventId, 'booking-approved-customer', 'EMAIL', notificationProcessedAt],
    );

    const queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    try {
      await new CreateSharedInbox1748400000007().up(queryRunner);
    } finally {
      await queryRunner.release();
    }

    const inboxRows = await ds.query(
      `SELECT "event_id", "consumer_name", "processed_at" FROM "shared"."inbox" ORDER BY "consumer_name"`,
    );
    expect(inboxRows).toHaveLength(2);

    const loyaltyRow = inboxRows.find(
      (r: { event_id: string }) => r.event_id === loyaltyEventId,
    ) as { consumer_name: string; processed_at: Date };
    expect(loyaltyRow.consumer_name).toBe('BOOKING_COMPLETED_LOYALTY_EFFECTS');
    expect(new Date(loyaltyRow.processed_at).toISOString()).toBe(loyaltyProcessedAt.toISOString());

    const notificationRow = inboxRows.find(
      (r: { event_id: string }) => r.event_id === notificationEventId,
    ) as { consumer_name: string; processed_at: Date };
    expect(notificationRow.consumer_name).toBe('booking-approved-customer:EMAIL');
    expect(new Date(notificationRow.processed_at).toISOString()).toBe(
      notificationProcessedAt.toISOString(),
    );

    const oldTables = await ds.query(`
      SELECT table_schema, table_name FROM information_schema.tables
      WHERE (table_schema, table_name) IN (
        ('loyalty', 'processed_events'), ('notification', 'processed_events')
      )
    `);
    expect(oldTables).toHaveLength(0);
  });
});
