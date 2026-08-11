import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOutboxLease1748500000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "shared"."outbox" ADD COLUMN "lease_token" UUID NULL`);
    await queryRunner.query(`ALTER TABLE "shared"."outbox" ADD COLUMN "lease_expires_at" TIMESTAMPTZ NULL`);
    await queryRunner.query(`CREATE INDEX "IDX_shared_outbox_lease" ON "shared"."outbox" ("lease_expires_at") WHERE "published_at" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "shared"."IDX_shared_outbox_lease"`);
    await queryRunner.query(`ALTER TABLE "shared"."outbox" DROP COLUMN "lease_expires_at"`);
    await queryRunner.query(`ALTER TABLE "shared"."outbox" DROP COLUMN "lease_token"`);
  }
}
