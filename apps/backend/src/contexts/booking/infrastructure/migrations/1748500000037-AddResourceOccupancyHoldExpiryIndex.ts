import { MigrationInterface, QueryRunner } from 'typeorm';

// TD51 — supports ExpireBookingHoldsJob's per-tenant sweep for HOLD rows whose hold_expires_at has
// passed. Partial on lock_state = 'HOLD' because only a pending manual-approval request carries a
// deadline (COMMITTED and REQUESTED rows have a null hold_expires_at), which keeps the index small.
// tenant_id leads, as in every composite index; there is no cross-tenant query, so no standalone
// index is needed.
//
// Plain CREATE INDEX, not CONCURRENTLY, same reasoning as 1748500000015-AddEndsAtIndexToResource
// Occupancy: nothing is in production yet, so the write-blocking lock a plain build takes has no
// real cost to mitigate.
export class AddResourceOccupancyHoldExpiryIndex1748500000037 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "IDX_booking_resource_occupancy_tenant_hold_expires_at"
        ON "booking"."resource_occupancy" ("tenant_id", "hold_expires_at")
        WHERE "lock_state" = 'HOLD'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "booking"."IDX_booking_resource_occupancy_tenant_hold_expires_at"
    `);
  }
}
