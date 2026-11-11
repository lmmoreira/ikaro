import { MigrationInterface, QueryRunner } from 'typeorm';

// M25-S10 — the operator-only `exempt` flag moves onto the provisioning registration, so every
// provisioning (operator or self-signup) hands Billing its intent through one record and the
// `TenantProvisioned` event carries only the registration id.
//
// A separate migration rather than an edit of 1748500000039, which has already run in staging.
// Expand only: a new column with a constant default. Postgres 11+ adds it as a catalog change (no
// table rewrite), and every existing row reads `false`, which is what none of them ever asked for.
export class AddExemptToSignupRegistrations1748500000043 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "billing"."signup_registrations" ADD COLUMN "exempt" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "billing"."signup_registrations" DROP COLUMN "exempt"`);
  }
}
