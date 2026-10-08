import { MigrationInterface, QueryRunner } from 'typeorm';

// A tenant's `settings.localization.language` is free text — `en-US` and `en-GB` are normal values
// — but the global default rows exist only for the shipped languages (`pt-BR`, `en`), and the
// per-tenant copy used to match the tag exactly. A tenant whose tag was not an exact match was
// therefore provisioned with no template rows at all, and findAllByTriggerEvent() returning
// nothing makes every notification skip silently. The copy now reduces the tag the way the rest of
// Ikaro does (@ikaro/i18n resolveSupportedLocale: an English primary subtag → en, else pt-BR);
// this migration gives the tenants that already exist the rows they never received.
//
// For every tenant and every global default of its resolved language, a tenant row is inserted
// unless the tenant already has one for that (trigger_event, channel) — ON CONFLICT DO NOTHING on
// the per-tenant unique index — so a row a tenant already has, customised or not, is never
// touched. It also covers the six recurring-schedule templates that
// 1748500000029-AddRecurringScheduleTemplates copied: that migration gave an `en-US` tenant the
// pt-BR rows, whose subject/body columns are never read (the copy is overlaid from
// notifications.json at send time, by the same resolved language), so they are left as they are.
//
// The cross-schema read of platform.tenants is confined to this one-off migration; no runtime
// code joins across contexts.
export class BackfillTenantTemplatesByResolvedLocale1748500000030 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "notification"."notification_templates"
        ("id", "tenant_id", "trigger_event", "channel", "locale", "subject", "body",
         "created_at", "updated_at")
      SELECT gen_random_uuid(), t."id", g."trigger_event", g."channel", g."locale",
             g."subject", g."body", now(), now()
        FROM "platform"."tenants" t
        JOIN "notification"."notification_templates" g
          ON g."tenant_id" IS NULL
         AND g."locale" = CASE
               WHEN lower(split_part(COALESCE(t."settings"->'localization'->>'language', ''), '-', 1)) = 'en'
                 THEN 'en'
               ELSE 'pt-BR'
             END
      ON CONFLICT DO NOTHING
    `);
  }

  // Deliberately a no-op: the inserted rows are indistinguishable from rows provisioning created,
  // and removing them would silently stop the tenant's notifications.
  public async down(): Promise<void> {
    // intentionally empty
  }
}
