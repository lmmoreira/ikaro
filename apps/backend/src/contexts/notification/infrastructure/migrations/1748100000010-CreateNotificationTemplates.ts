import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MigrationInterface, QueryRunner } from 'typeorm';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { NOTIFICATION_TEMPLATE_KEY_MAPPING } from '../../domain/notification-template-key.mapping';

// TD02-S10 — global default templates are seeded directly from packages/i18n/locales/<locale>/
// notifications.json (one row per trigger_event x locale) instead of inline pt-BR literals, so
// the locale file stays the single source of truth and the migration can't drift from it.
const SEED_LOCALES = ['pt-BR', 'en'] as const;

interface LocalizedTemplate {
  subject: string;
  body: string;
}

type NotificationsFile = Record<string, Record<string, LocalizedTemplate>>;

interface SeedRow {
  triggerEvent: string;
  channel: string;
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
    for (const triggerEvent of Object.values(NotificationTemplateKey)) {
      const { eventName, recipientType } = NOTIFICATION_TEMPLATE_KEY_MAPPING[triggerEvent];
      const template = file[eventName]?.[recipientType];
      if (!template) {
        throw new Error(
          `Missing notification template for event "${eventName}" / recipient "${recipientType}" in locale "${locale}" (trigger_event "${triggerEvent}")`,
        );
      }
      rows.push({
        triggerEvent,
        channel: 'EMAIL',
        locale,
        subject: template.subject,
        body: template.body,
      });
    }
  }
  return rows;
}

export class CreateNotificationTemplates1748100000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "notification"."notification_templates" (
        "id"            UUID          NOT NULL,
        "tenant_id"     UUID          NULL,
        "trigger_event" VARCHAR(100)  NOT NULL,
        "channel"       VARCHAR(20)   NOT NULL DEFAULT 'EMAIL',
        "locale"        VARCHAR(10)   NOT NULL DEFAULT 'pt-BR',
        "subject"       VARCHAR(255)  NOT NULL,
        "body"          TEXT          NOT NULL,
        "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notification_templates" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_notification_templates_global"
        ON "notification"."notification_templates" ("trigger_event", "channel", "locale")
        WHERE "tenant_id" IS NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_notification_templates_tenant"
        ON "notification"."notification_templates" ("tenant_id", "trigger_event", "channel")
        WHERE "tenant_id" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_notification_templates_tenant_id"
        ON "notification"."notification_templates" ("tenant_id")
    `);

    const rows = buildSeedRows();
    const valuesSql = rows
      .map((_, i) => {
        const base = i * 5;
        return `(gen_random_uuid(), NULL, $${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
      })
      .join(',\n        ');
    const params = rows.flatMap((r) => [r.triggerEvent, r.channel, r.locale, r.subject, r.body]);

    await queryRunner.query(
      `INSERT INTO "notification"."notification_templates"
         ("id", "tenant_id", "trigger_event", "channel", "locale", "subject", "body")
       VALUES
        ${valuesSql}
       ON CONFLICT DO NOTHING`,
      params,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification"."notification_templates"`);
  }
}
