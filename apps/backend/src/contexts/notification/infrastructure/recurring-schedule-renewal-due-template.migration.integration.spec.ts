import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { TenantEntityBuilder } from '../../../test/builders/platform/tenant-entity.builder';
import { TenantSettings } from '../../platform/domain/value-objects/tenant-settings.vo';
import { TenantEntity } from '../../platform/infrastructure/entities/tenant.entity';
import { createTestDataSource } from '../../../test/test-datasource';
import { NotificationTemplateKey } from '../domain/notification-template-key.enum';
import { AddRecurringScheduleRenewalDueTemplate1748500000034 } from './migrations/1748500000034-AddRecurringScheduleRenewalDueTemplate';

const KEY = NotificationTemplateKey.RECURRING_SCHEDULE_RENEWAL_DUE_CUSTOMER;

// M23-S21: the migration seeds the renewal-reminder template for the global default and for a
// tenant that existed before it — without the per-tenant copy the email silently never sends for
// every pre-existing tenant (docs/ENGINEERING_RULES_BACKEND.md § Adding a new notification type).
describe('AddRecurringScheduleRenewalDueTemplate migration (integration)', () => {
  let ds: DataSource;
  const portugueseTenantId = uuidv7();
  const englishTenantId = uuidv7();

  async function runMigration(): Promise<void> {
    const queryRunner = ds.createQueryRunner();
    try {
      await new AddRecurringScheduleRenewalDueTemplate1748500000034().up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  const tenantRows = (tenantId: string) =>
    ds.query<{ locale: string; subject: string }[]>(
      `SELECT locale, subject FROM notification.notification_templates
        WHERE tenant_id = $1 AND trigger_event = $2`,
      [tenantId, KEY],
    );

  beforeAll(async () => {
    ds = await createTestDataSource();
    const withLanguage = (language: string) => {
      const settings = TenantSettings.default().toJSON();
      return { ...settings, localization: { ...settings.localization, language } };
    };
    await ds.getRepository(TenantEntity).save([
      new TenantEntityBuilder()
        .withId(portugueseTenantId)
        .withSlug(`renewal-pt-${portugueseTenantId.slice(-8)}`)
        .withSettings(withLanguage('pt-BR'))
        .build(),
      new TenantEntityBuilder()
        .withId(englishTenantId)
        .withSlug(`renewal-en-${englishTenantId.slice(-8)}`)
        .withSettings(withLanguage('en'))
        .build(),
    ]);
    // Tenants that existed before the migration have no row for the new key.
    await ds.query(
      `DELETE FROM notification.notification_templates WHERE tenant_id = ANY($1::uuid[]) AND trigger_event = $2`,
      [[portugueseTenantId, englishTenantId], KEY],
    );
  });

  afterAll(async () => {
    await ds.query(
      `DELETE FROM notification.notification_templates WHERE tenant_id = ANY($1::uuid[])`,
      [[portugueseTenantId, englishTenantId]],
    );
    await ds
      .getRepository(TenantEntity)
      .delete([{ id: portugueseTenantId }, { id: englishTenantId }]);
    await ds.destroy();
  });

  it('seeds the global default in both locales', async () => {
    await runMigration();

    const globals = await ds.query<{ locale: string }[]>(
      `SELECT locale FROM notification.notification_templates WHERE tenant_id IS NULL AND trigger_event = $1`,
      [KEY],
    );
    expect(globals.map((g) => g.locale).sort()).toEqual(['en', 'pt-BR']);
  });

  it('gives a tenant that existed before it one row in its own language', async () => {
    await runMigration();

    const portuguese = await tenantRows(portugueseTenantId);
    const english = await tenantRows(englishTenantId);
    expect(portuguese).toHaveLength(1);
    expect(portuguese[0].locale).toBe('pt-BR');
    expect(portuguese[0].subject).toContain('Sua reserva recorrente termina em');
    expect(english).toHaveLength(1);
    expect(english[0].locale).toBe('en');
    expect(english[0].subject).toContain('Your recurring reservation ends on');
  });

  it('is idempotent: a second run adds no rows', async () => {
    await runMigration();
    await runMigration();

    expect(await tenantRows(portugueseTenantId)).toHaveLength(1);
    expect(await tenantRows(englishTenantId)).toHaveLength(1);
  });
});
