import { MigrationInterface, QueryRunner } from 'typeorm';

// TD40 Story 2 retention purge: supports ResourceOccupancyRetentionPurgeJob's cross-tenant
// `WHERE ends_at < $1` predicate — without this, that daily, unscoped scan degrades to a full
// table scan as resource_occupancy grows, since the existing composite index
// (IDX_booking_resource_occupancy_tenant_resource_starts) is led by tenant_id and can't be
// seeked without a tenant_id predicate (docs/ENGINEERING_RULES_TESTING.md § Standalone index for a
// cross-tenant system job). Mirrors AddExpiresAtIndexToLeadFormSubmissions /
// AddStartedAtIndexToChatbotSessions's identical fix for the same class of gap.
//
// Plain CREATE INDEX, not CONCURRENTLY, same reasoning as those migrations: resource_occupancy
// was created this same pre-production milestone (M22-S03, 2026-09-17) and carries no production
// traffic yet, so the write-blocking lock a plain index build takes has no real cost to mitigate.
export class AddEndsAtIndexToResourceOccupancy1748500000015 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_booking_resource_occupancy_ends_at"
        ON "booking"."resource_occupancy" ("ends_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "booking"."IDX_booking_resource_occupancy_ends_at"
    `);
  }
}
