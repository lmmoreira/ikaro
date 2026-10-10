import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { NOTIFICATION_TEMPLATE_KEY_MAPPING } from '../../domain/notification-template-key.mapping';

// M23-S25 — the booking-no-show customer email template.
//
// A separate migration rather than an edit of 1748100000010-CreateNotificationTemplates.ts, which
// has already run in staging. That migration's seeding iterates every NotificationTemplateKey, so a
// brand-new database has this global row by the time this one runs: every insert below is
// ON CONFLICT DO NOTHING and the migration is a no-op there.
//
// What matters is the environments that already ran the original migration:
//  1. the global default rows for the new key (tenant_id IS NULL), both locales;
//  2. a per-tenant copy for every tenant that already exists. copyGlobalDefaultsForTenant only runs
//     once, on TenantProvisioned, so without this copy findAllByTriggerEvent(tenantId, newKey)
//     returns nothing for every pre-existing tenant and the email silently never sends
//     (docs/ENGINEERING_RULES_BACKEND.md § Adding a new notification type).
//
// Per-tenant rows are one per (tenant_id, trigger_event, channel) — the unique index is not
// locale-scoped — so each tenant takes ONE global row, in its own language. A tenant's language is
// set once, at provisioning, from its country (pt-BR or en — packages/i18n country-defaults) and
// is read-only in the settings screen, so it is always one of the two shipped languages: it is read
// from platform.tenants.settings.localization.language (the value getTenantInfo().locale returns)
// and anything else falls back to pt-BR, the way DEFAULT_LOCALE does. The cross-schema read is
// confined to this one-off migration; no runtime code joins across contexts.
const SEED_LOCALES = ['pt-BR', 'en'] as const;

const NEW_KEYS: NotificationTemplateKey[] = [NotificationTemplateKey.BOOKING_NO_SHOW_CUSTOMER];

interface LocalizedTemplate {
  subject: string;
  body: string;
}

type NotificationsFile = Record<string, Record<string, LocalizedTemplate>>;

interface SeedRow {
  triggerEvent: string;
  locale: string;
  subject: string;
  body: string;
}

function readNotificationsFile(locale: string): NotificationsFile {
  const path = join(
    dirname(require.resolve('@ikaro/i18n/package.json')),
    'locales',
    locale,
    'notifications.json',
  );
  return JSON.parse(readFileSync(path, 'utf-8')) as NotificationsFile;
}

function buildSeedRows(): SeedRow[] {
  const rows: SeedRow[] = [];
  for (const locale of SEED_LOCALES) {
    const file = readNotificationsFile(locale);
    for (const triggerEvent of NEW_KEYS) {
      const { eventName, recipientType } = NOTIFICATION_TEMPLATE_KEY_MAPPING[triggerEvent];
      const template = file[eventName]?.[recipientType];
      if (!template) {
        throw new Error(
          `Missing notification template for event "${eventName}" / recipient "${recipientType}" in locale "${locale}" (trigger_event "${triggerEvent}")`,
        );
      }
      rows.push({ triggerEvent, locale, subject: template.subject, body: template.body });
    }
  }
  return rows;
}

export class AddBookingNoShowCustomerTemplate1748500000032 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = buildSeedRows();
    const valuesSql = rows
      .map((_, i) => {
        const base = i * 4;
        return `(gen_random_uuid(), NULL, $${base + 1}, 'EMAIL', $${base + 2}, $${base + 3}, $${base + 4})`;
      })
      .join(',\n        ');
    const params = rows.flatMap((r) => [r.triggerEvent, r.locale, r.subject, r.body]);

    await queryRunner.query(
      `INSERT INTO "notification"."notification_templates"
         ("id", "tenant_id", "trigger_event", "channel", "locale", "subject", "body")
       VALUES
        ${valuesSql}
       ON CONFLICT DO NOTHING`,
      params,
    );

    await queryRunner.query(
      `INSERT INTO "notification"."notification_templates"
         ("id", "tenant_id", "trigger_event", "channel", "locale", "subject", "body",
          "created_at", "updated_at")
       SELECT gen_random_uuid(), t."id", g."trigger_event", g."channel", g."locale",
              g."subject", g."body", now(), now()
         FROM "platform"."tenants" t
         JOIN "notification"."notification_templates" g
           ON g."tenant_id" IS NULL
          AND g."trigger_event" = ANY($1::text[])
          AND g."locale" = CASE
                WHEN t."settings"->'localization'->>'language' = ANY($2::text[])
                  THEN t."settings"->'localization'->>'language'
                ELSE 'pt-BR'
              END
       ON CONFLICT DO NOTHING`,
      [NEW_KEYS, SEED_LOCALES],
    );
  }

  // Deliberately a no-op. On a database built from scratch the global rows were seeded by
  // CreateNotificationTemplates1748100000010 (its seeding iterates every NotificationTemplateKey),
  // so this migration does not own them, and deleting them — or the per-tenant copies made since —
  // on a rollback would silently stop these emails until something re-seeded the rows. Leftover
  // rows are harmless to code that no longer knows the keys.
  public async down(): Promise<void> {
    // intentionally empty
  }
}
