import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  NOTIFICATION_TEMPLATE_KEY_MAPPING,
  PLATFORM_SCOPED_TEMPLATE_KEYS,
} from '../../domain/notification-template-key.mapping';

// M26-S11 — Billing's platform-scoped manager emails (UC-124).
//
// A separate migration rather than an edit of 1748100000010-CreateNotificationTemplates.ts, which
// has already run in staging. That migration's seeding iterates every NotificationTemplateKey, so a
// brand-new database already has these global rows by the time this one runs: the insert below is
// ON CONFLICT DO NOTHING and the migration is a no-op there.
//
// Unlike the other "Add…Template" migrations, this one makes NO per-tenant copy: a platform-scoped
// row is Ikaro's, not a tenant's, and copyGlobalDefaultsForTenant excludes it (UC-124: "no
// per-tenant copy and no backfill"). The row proves the key is provisioned and carries the
// trigger_event the platform lookup reads; the email text comes from notifications.json at send time.
const SEED_LOCALES = ['pt-BR', 'en'] as const;

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
    for (const triggerEvent of PLATFORM_SCOPED_TEMPLATE_KEYS) {
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

export class SeedBillingTemplates1748500000050 implements MigrationInterface {
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
  }

  // Deliberately a no-op. On a database built from scratch the global rows were seeded by
  // CreateNotificationTemplates1748100000010 (its seeding iterates every NotificationTemplateKey),
  // so this migration does not own them, and deleting them on a rollback would make every Billing
  // email fail with a missing-template error until something re-seeded the rows.
  public async down(): Promise<void> {
    // intentionally empty
  }
}
