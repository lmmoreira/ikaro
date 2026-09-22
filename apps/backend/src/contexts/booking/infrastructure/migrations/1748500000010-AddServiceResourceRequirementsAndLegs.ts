import { MigrationInterface, QueryRunner } from 'typeorm';

// M22-S01 — expand + backfill only (docs/13-DATABASE_SCHEMA.md's Cluster 2 migration-ordering
// steps 1-2). This story creates service_resource_requirements, so it also owns backfilling it;
// resource_occupancy/booking_line_resource_assignments' own dual-write/validate/contract phases
// belong to S03. Today's car wash is the degenerate case: every existing service gets exactly
// one { LOCATION, NONE } requirement row, referencing the M21-S02-backfilled LOCATION resource.
export class AddServiceResourceRequirementsAndLegs1748500000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "booking"."services"
        ADD COLUMN IF NOT EXISTS "booking_model" VARCHAR(20) NOT NULL DEFAULT 'APPOINTMENT'
          CHECK ("booking_model" IN ('APPOINTMENT', 'SESSION')),
        ADD COLUMN IF NOT EXISTS "buffer_after_minutes" INTEGER
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_booking_services_tenant_booking_model"
        ON "booking"."services" ("tenant_id", "booking_model")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."service_resource_requirements" (
        "id"                UUID          NOT NULL,
        "tenant_id"         UUID          NOT NULL,
        "service_id"        UUID          NOT NULL,
        "resource_type"     VARCHAR(20)   NOT NULL,
        "selection_mode"    VARCHAR(30)   NOT NULL
          CHECK (selection_mode IN ('NONE','CUSTOMER_CHOICE','AUTO_ANY','AUTO_FUNGIBLE_POOL')),
        "required_quantity" INTEGER       NOT NULL DEFAULT 1 CHECK (required_quantity > 0),
        CONSTRAINT "PK_service_resource_requirements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_service_resource_requirements_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "UQ_service_resource_requirements_tenant_service_type"
          UNIQUE ("tenant_id", "service_id", "resource_type"),
        CONSTRAINT "FK_service_resource_requirements_service"
          FOREIGN KEY ("tenant_id", "service_id") REFERENCES "booking"."services" ("tenant_id", "id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."service_resource_requirement_pool" (
        "tenant_id"      UUID NOT NULL,
        "requirement_id" UUID NOT NULL,
        "resource_id"    UUID NOT NULL,
        CONSTRAINT "PK_service_resource_requirement_pool" PRIMARY KEY ("tenant_id", "requirement_id", "resource_id"),
        CONSTRAINT "FK_service_resource_requirement_pool_requirement"
          FOREIGN KEY ("tenant_id", "requirement_id")
          REFERENCES "booking"."service_resource_requirements" ("tenant_id", "id") ON DELETE CASCADE,
        CONSTRAINT "FK_service_resource_requirement_pool_resource"
          FOREIGN KEY ("tenant_id", "resource_id") REFERENCES "booking"."resources" ("tenant_id", "id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."service_legs" (
        "id"                            UUID          NOT NULL,
        "tenant_id"                     UUID          NOT NULL,
        "service_id"                    UUID          NOT NULL,
        "leg_index"                     INTEGER       NOT NULL,
        "name"                          VARCHAR(255)  NOT NULL,
        "duration_minutes"              INTEGER       NOT NULL CHECK (duration_minutes > 0),
        "transition_gap_after_minutes"  INTEGER       NOT NULL DEFAULT 0,
        CONSTRAINT "PK_service_legs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_service_legs_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "UQ_service_legs_tenant_service_index" UNIQUE ("tenant_id", "service_id", "leg_index"),
        CONSTRAINT "FK_service_legs_service"
          FOREIGN KEY ("tenant_id", "service_id") REFERENCES "booking"."services" ("tenant_id", "id")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."service_leg_resource_requirements" (
        "id"                UUID          NOT NULL,
        "tenant_id"         UUID          NOT NULL,
        "leg_id"            UUID          NOT NULL,
        "resource_type"     VARCHAR(20)   NOT NULL,
        "selection_mode"    VARCHAR(30)   NOT NULL
          CHECK (selection_mode IN ('NONE','CUSTOMER_CHOICE','AUTO_ANY','AUTO_FUNGIBLE_POOL')),
        "required_quantity" INTEGER       NOT NULL DEFAULT 1 CHECK (required_quantity > 0),
        CONSTRAINT "PK_service_leg_resource_requirements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_service_leg_resource_requirements_tenant_id" UNIQUE ("tenant_id", "id"),
        CONSTRAINT "UQ_service_leg_resource_requirements_tenant_leg_type"
          UNIQUE ("tenant_id", "leg_id", "resource_type"),
        CONSTRAINT "FK_service_leg_resource_requirements_leg"
          FOREIGN KEY ("tenant_id", "leg_id")
          REFERENCES "booking"."service_legs" ("tenant_id", "id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."service_leg_resource_requirement_pool" (
        "tenant_id"      UUID NOT NULL,
        "requirement_id" UUID NOT NULL,
        "resource_id"    UUID NOT NULL,
        CONSTRAINT "PK_service_leg_resource_requirement_pool" PRIMARY KEY ("tenant_id", "requirement_id", "resource_id"),
        CONSTRAINT "FK_service_leg_resource_requirement_pool_requirement"
          FOREIGN KEY ("tenant_id", "requirement_id")
          REFERENCES "booking"."service_leg_resource_requirements" ("tenant_id", "id") ON DELETE CASCADE,
        CONSTRAINT "FK_service_leg_resource_requirement_pool_resource"
          FOREIGN KEY ("tenant_id", "resource_id") REFERENCES "booking"."resources" ("tenant_id", "id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "booking"."service_class_resource_pool" (
        "tenant_id"      UUID          NOT NULL,
        "service_id"     UUID          NOT NULL,
        "resource_type"  VARCHAR(20)   NOT NULL,
        "resource_id"    UUID          NOT NULL,
        CONSTRAINT "PK_service_class_resource_pool" PRIMARY KEY ("tenant_id", "service_id", "resource_type", "resource_id"),
        CONSTRAINT "FK_service_class_resource_pool_service"
          FOREIGN KEY ("tenant_id", "service_id")
          REFERENCES "booking"."services" ("tenant_id", "id") ON DELETE CASCADE,
        CONSTRAINT "FK_service_class_resource_pool_resource"
          FOREIGN KEY ("tenant_id", "resource_id") REFERENCES "booking"."resources" ("tenant_id", "id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_service_class_resource_pool_service_type"
        ON "booking"."service_class_resource_pool" ("tenant_id", "service_id", "resource_type")
    `);

    // Backfill: one { LOCATION, NONE } requirement per existing (necessarily APPOINTMENT)
    // service, referencing the M21-S02-backfilled active LOCATION resource for that tenant.
    await queryRunner.query(`
      INSERT INTO "booking"."service_resource_requirements"
        ("id", "tenant_id", "service_id", "resource_type", "selection_mode", "required_quantity")
      SELECT gen_random_uuid(), s."tenant_id", s."id", 'LOCATION', 'NONE', 1
      FROM "booking"."services" s
      WHERE EXISTS (
        SELECT 1 FROM "booking"."resources" r
        WHERE r."tenant_id" = s."tenant_id" AND r."type" = 'LOCATION' AND r."is_active"
      )
      AND NOT EXISTS (
        SELECT 1 FROM "booking"."service_resource_requirements" existing
        WHERE existing."tenant_id" = s."tenant_id" AND existing."service_id" = s."id"
      )
    `);

    // Backfill: snapshot each tenant's current serviceBufferMinutes onto every existing
    // service (resolved during M22-S01 story-discovery — bufferAfterMinutes is a concrete
    // per-service value, not null-with-fallback, so S03's max(bufferAfterMinutes,
    // turnoverMinutes) formula never has to special-case a pre-M22 service).
    await queryRunner.query(`
      UPDATE "booking"."services" s
      SET "buffer_after_minutes" = COALESCE((t."settings"->'booking'->>'serviceBufferMinutes')::int, 60)
      FROM "platform"."tenants" t
      WHERE s."tenant_id" = t."id" AND s."buffer_after_minutes" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."service_class_resource_pool"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "booking"."service_leg_resource_requirement_pool"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."service_leg_resource_requirements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."service_legs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."service_resource_requirement_pool"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "booking"."service_resource_requirements"`);
    await queryRunner.query(`
      ALTER TABLE "booking"."services"
        DROP COLUMN IF EXISTS "booking_model",
        DROP COLUMN IF EXISTS "buffer_after_minutes"
    `);
  }
}
