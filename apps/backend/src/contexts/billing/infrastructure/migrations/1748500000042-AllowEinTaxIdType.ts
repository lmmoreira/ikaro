import { MigrationInterface, QueryRunner } from 'typeorm';

// M25-S06 — the US tax id type. `tax_id_type` on billing_accounts and signup_registrations gains
// 'EIN' (US Employer Identification Number); 'OTHER' stays for a country with no rule of its own.
//
// A separate migration rather than an edit of 1748500000039, which has already run in staging.
// Each constraint is replaced as NOT VALID + a separate VALIDATE CONSTRAINT (docs/ANTI_PATTERNS.md
// § A plain ALTER TABLE): a plain ADD CONSTRAINT would hold ACCESS EXCLUSIVE while it scans the
// table; NOT VALID takes only a brief lock and VALIDATE runs under SHARE UPDATE EXCLUSIVE. Expand
// only: every value the old constraint allowed is still allowed, so no row can fail the VALIDATE.
const TABLES = [
  { table: 'billing_accounts', constraint: 'CHK_billing_billing_accounts_tax_id_type' },
  { table: 'signup_registrations', constraint: 'CHK_billing_signup_registrations_tax_id_type' },
] as const;

async function replaceConstraint(queryRunner: QueryRunner, allowedTypes: string): Promise<void> {
  for (const { table, constraint } of TABLES) {
    await queryRunner.query(`ALTER TABLE "billing"."${table}" DROP CONSTRAINT "${constraint}"`);
    await queryRunner.query(`
      ALTER TABLE "billing"."${table}"
        ADD CONSTRAINT "${constraint}"
        CHECK ("tax_id_type" IS NULL OR "tax_id_type" IN (${allowedTypes})) NOT VALID
    `);
    await queryRunner.query(`ALTER TABLE "billing"."${table}" VALIDATE CONSTRAINT "${constraint}"`);
  }
}

export class AllowEinTaxIdType1748500000042 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await replaceConstraint(queryRunner, `'CNPJ','CPF','EIN','OTHER'`);
  }

  // A row already holding 'EIN' becomes 'OTHER' first (its tax_id value is kept), so the narrower
  // constraint never meets a value it does not know.
  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table } of TABLES) {
      await queryRunner.query(
        `UPDATE "billing"."${table}" SET "tax_id_type" = 'OTHER' WHERE "tax_id_type" = 'EIN'`,
      );
    }
    await replaceConstraint(queryRunner, `'CNPJ','CPF','OTHER'`);
  }
}
