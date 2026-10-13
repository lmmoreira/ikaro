import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { TenantEntityBuilder } from '../../../test/builders/platform/tenant-entity.builder';
import { TenantSettings } from '../../platform/domain/value-objects/tenant-settings.vo';
import { TenantEntity } from '../../platform/infrastructure/entities/tenant.entity';
import { createTestDataSource } from '../../../test/test-datasource';
import { NotificationTemplateKey } from '../domain/notification-template-key.enum';
import { AddFutureCommitmentWorklistTemplates1748500000035 } from './migrations/1748500000035-AddFutureCommitmentWorklistTemplates';

const KEYS = [
  NotificationTemplateKey.RESOURCE_DEACTIVATION_IMPACT_ADMIN,
  NotificationTemplateKey.BOOKING_RESOURCE_REASSIGNED_CUSTOMER,
];

// M23-S23: the migration seeds the two worklist templates for the global default and for a tenant
// that existed before it — without the per-tenant copy the emails silently never send for every
// pre-existing tenant (docs/ENGINEERING_RULES_BACKEND.md § Adding a new notification type).
describe('AddFutureCommitmentWorklistTemplates migration (integration)', () => {
  let ds: DataSource;
  const portugueseTenantId = uuidv7();
  const englishTenantId = uuidv7();

  async function runMigration(): Promise<void> {
    const queryRunner = ds.createQueryRunner();
    try {
      await new AddFutureCommitmentWorklistTemplates1748500000035().up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  const tenantRows = (tenantId: string) =>
    ds.query<{ trigger_event: string; locale: string; subject: string }[]>(
      `SELECT trigger_event, locale, subject FROM notification.notification_templates
        WHERE tenant_id = $1 AND trigger_event = ANY($2::text[])
        ORDER BY trigger_event`,
      [tenantId, KEYS],
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
        .withSlug(`worklist-pt-${portugueseTenantId.slice(-8)}`)
        .withSettings(withLanguage('pt-BR'))
        .build(),
      new TenantEntityBuilder()
        .withId(englishTenantId)
        .withSlug(`worklist-en-${englishTenantId.slice(-8)}`)
        .withSettings(withLanguage('en'))
        .build(),
    ]);
    // Tenants that existed before the migration have no row for the new keys.
    await ds.query(
      `DELETE FROM notification.notification_templates
        WHERE tenant_id = ANY($1::uuid[]) AND trigger_event = ANY($2::text[])`,
      [[portugueseTenantId, englishTenantId], KEYS],
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

  it('seeds the global default of both templates in both locales', async () => {
    await runMigration();

    const globals = await ds.query<{ trigger_event: string; locale: string }[]>(
      `SELECT trigger_event, locale FROM notification.notification_templates
        WHERE tenant_id IS NULL AND trigger_event = ANY($1::text[])
        ORDER BY trigger_event, locale`,
      [KEYS],
    );
    expect(globals.map((g) => `${g.trigger_event}:${g.locale}`)).toEqual([
      'booking-resource-reassigned-customer:en',
      'booking-resource-reassigned-customer:pt-BR',
      'resource-deactivation-impact-admin:en',
      'resource-deactivation-impact-admin:pt-BR',
    ]);
  });

  it('gives a tenant that existed before it one row per template in its own language', async () => {
    await runMigration();

    const portuguese = await tenantRows(portugueseTenantId);
    const english = await tenantRows(englishTenantId);
    expect(portuguese.map((r) => [r.trigger_event, r.locale])).toEqual([
      ['booking-resource-reassigned-customer', 'pt-BR'],
      ['resource-deactivation-impact-admin', 'pt-BR'],
    ]);
    expect(portuguese[0].subject).toContain('O recurso do seu agendamento mudou');
    expect(english.map((r) => [r.trigger_event, r.locale])).toEqual([
      ['booking-resource-reassigned-customer', 'en'],
      ['resource-deactivation-impact-admin', 'en'],
    ]);
    expect(english[0].subject).toContain('The resource for your booking changed');
  });

  it('is idempotent: a second run adds no rows', async () => {
    await runMigration();
    await runMigration();

    expect(await tenantRows(portugueseTenantId)).toHaveLength(2);
    expect(await tenantRows(englishTenantId)).toHaveLength(2);
  });
});
