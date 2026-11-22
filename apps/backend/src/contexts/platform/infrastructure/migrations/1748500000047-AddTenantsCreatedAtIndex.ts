import { MigrationInterface, QueryRunner } from 'typeorm';

// M26-S08 (UC-140): a standalone (created_at, id) index on platform.tenants. The self-heal job and
// the access resolver's provisioning window list tenants by age without a tenant id, so no
// (tenant_id, ...) composite can serve them (CLAUDE.md: a cross-tenant system job needs its own
// standalone index). Index only, expand-only: no column or constraint change.
//
// A plain CREATE INDEX, not CONCURRENTLY: CONCURRENTLY cannot run inside a transaction and every
// migration here runs under migrationsTransactionMode "all"; the table is small and nothing is in
// production yet (precedent: 1748400000013-AddStartedAtIndexToChatbotSessions).
export class AddTenantsCreatedAtIndex1748500000047 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_platform_tenants_created_at" ON "platform"."tenants" ("created_at", "id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "platform"."IDX_platform_tenants_created_at"`);
  }
}
