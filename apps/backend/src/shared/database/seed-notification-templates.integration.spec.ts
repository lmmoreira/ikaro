import { DataSource } from 'typeorm';
import { PLATFORM_SCOPED_TEMPLATE_KEYS } from '../../contexts/notification/domain/notification-template-key.mapping';
import { uuidv7 } from '../domain/uuid-v7';
import { createTestDataSource } from '../../test/test-datasource';
import { copyGlobalNotificationTemplates } from './seed-notification-templates';

describe('copyGlobalNotificationTemplates (integration)', () => {
  let dataSource: DataSource;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    dataSource = await createTestDataSource();
  });

  afterEach(async () => {
    await dataSource.query(
      `DELETE FROM "notification"."notification_templates" WHERE tenant_id = ANY($1::uuid[])`,
      [tenantIds],
    );
    tenantIds.length = 0;
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  async function copyForTwoTenants(): Promise<[string, string]> {
    const first = uuidv7();
    const second = uuidv7();
    tenantIds.push(first, second);
    const runner = dataSource.createQueryRunner();
    try {
      await copyGlobalNotificationTemplates(runner, [first, second]);
    } finally {
      await runner.release();
    }
    return [first, second];
  }

  it('gives each tenant every global default except the platform-scoped templates', async () => {
    const [expected] = await dataSource.query<{ n: string }[]>(
      `SELECT COUNT(DISTINCT (trigger_event, channel)) AS n
         FROM "notification"."notification_templates"
        WHERE tenant_id IS NULL AND trigger_event <> ALL($1::text[])`,
      [PLATFORM_SCOPED_TEMPLATE_KEYS],
    );

    const copiedTenants = await copyForTwoTenants();

    for (const tenantId of copiedTenants) {
      const rows = await dataSource.query<{ trigger_event: string }[]>(
        `SELECT trigger_event FROM "notification"."notification_templates" WHERE tenant_id = $1`,
        [tenantId],
      );
      expect(rows).toHaveLength(Number(expected.n));
      expect(rows.length).toBeGreaterThan(0);
      for (const { trigger_event } of rows) {
        expect(PLATFORM_SCOPED_TEMPLATE_KEYS).not.toContain(trigger_event);
      }
    }
  });

  it('is idempotent: a second run adds nothing', async () => {
    const [first] = await copyForTwoTenants();
    const count = () =>
      dataSource.query<{ n: string }[]>(
        `SELECT COUNT(*) AS n FROM "notification"."notification_templates" WHERE tenant_id = $1`,
        [first],
      );
    const [before] = await count();

    const runner = dataSource.createQueryRunner();
    try {
      await copyGlobalNotificationTemplates(runner, [first]);
    } finally {
      await runner.release();
    }

    const [after] = await count();
    expect(after.n).toBe(before.n);
  });
});
