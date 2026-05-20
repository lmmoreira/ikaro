import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerTenantOAuthUniqueConstraint1748000000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_customers_tenant_oauth"
        ON "customer"."customers" ("tenant_id", "google_oauth_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "customer"."UQ_customer_customers_tenant_oauth"`);
  }
}
