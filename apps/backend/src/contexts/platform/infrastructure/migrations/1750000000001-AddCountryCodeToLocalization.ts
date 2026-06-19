import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCountryCodeToLocalization1750000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Backfill country_code = 'BR' for all existing tenants that lack it in settings.localization
    await queryRunner.query(`
      UPDATE "platform"."tenants"
      SET "settings" = jsonb_set(
        "settings",
        '{localization,country_code}',
        '"BR"',
        true
      )
      WHERE "settings" -> 'localization' ->> 'country_code' IS NULL
    `);

    // Remove legacy currency_symbol default 'R$' — derived at render time via Intl.NumberFormat.
    // Tenants that explicitly overrode to a different symbol keep their value.
    await queryRunner.query(`
      UPDATE "platform"."tenants"
      SET "settings" = "settings" #- '{localization,currency_symbol}'
      WHERE "settings" -> 'localization' ->> 'currency_symbol' = 'R$'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "platform"."tenants"
      SET "settings" = "settings" #- '{localization,country_code}'
      WHERE "settings" -> 'localization' ->> 'country_code' IS NOT NULL
    `);
  }
}
