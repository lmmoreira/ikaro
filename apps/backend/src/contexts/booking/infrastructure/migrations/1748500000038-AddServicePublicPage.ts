import { MigrationInterface, QueryRunner } from 'typeorm';

// TD56-S03 — a service's own public page: a rich-content profile (JSONB, always read and written as
// one object), the publish switch, and the URL slug the system generates on the first publish.
//
// The three column adds are metadata-only on a live table: both nullable columns need no rewrite,
// and `public_page_published` has a constant default, which PostgreSQL 11+ also applies without a
// rewrite. No CHECK constraint: the slug format is enforced by the ServicePublicSlug value object.
//
// The unique index is partial (many services have no slug) and leads with tenant_id, as every
// composite index does; there is no cross-tenant query, so no standalone index is needed. Plain
// CREATE UNIQUE INDEX, not CONCURRENTLY, same reasoning as 1748500000015-AddEndsAtIndexToResource
// Occupancy: migrations run transactionally and nothing is in production yet.
export class AddServicePublicPage1748500000038 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."services"
        ADD COLUMN "public_profile" jsonb NULL,
        ADD COLUMN "public_slug" varchar(60) NULL,
        ADD COLUMN "public_page_published" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_booking_services_tenant_public_slug"
        ON "booking"."services" ("tenant_id", "public_slug")
        WHERE "public_slug" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "booking"."UQ_booking_services_tenant_public_slug"`);
    await queryRunner.query(`
      ALTER TABLE "booking"."services"
        DROP COLUMN "public_page_published",
        DROP COLUMN "public_slug",
        DROP COLUMN "public_profile"
    `);
  }
}
