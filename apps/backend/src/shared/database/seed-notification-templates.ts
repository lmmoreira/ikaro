import type { QueryRunner } from 'typeorm';
import { PLATFORM_SCOPED_TEMPLATE_KEYS } from '../../contexts/notification/domain/notification-template-key.mapping';

// Mirrors TenantProvisionedHandler → copyGlobalDefaultsForTenant for the seed tenants: copies every
// global template (tenant_id IS NULL) into each tenant, in one statement for all of them rather than
// one awaited query per tenant. The platform-scoped templates (Billing's manager emails, UC-124) are
// Ikaro's, not a tenant's, so they are excluded exactly as copyGlobalDefaultsForTenant excludes them.
export async function copyGlobalNotificationTemplates(
  q: QueryRunner,
  tenantIds: readonly string[],
): Promise<void> {
  await q.query(
    `INSERT INTO notification.notification_templates
       (id, tenant_id, trigger_event, channel, subject, body, created_at, updated_at)
     SELECT gen_random_uuid(), t.tenant_id, g.trigger_event, g.channel, g.subject, g.body, now(), now()
     FROM unnest($1::uuid[]) AS t(tenant_id)
     CROSS JOIN notification.notification_templates g
     WHERE g.tenant_id IS NULL AND g.trigger_event <> ALL($2::text[])
     ON CONFLICT DO NOTHING`,
    [tenantIds, PLATFORM_SCOPED_TEMPLATE_KEYS],
  );
}
