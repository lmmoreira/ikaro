import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSharedSchema1748400000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "shared"`);

    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ikaro') THEN
          GRANT USAGE ON SCHEMA "shared" TO ikaro;
          ALTER DEFAULT PRIVILEGES IN SCHEMA "shared"
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ikaro;
          ALTER DEFAULT PRIVILEGES IN SCHEMA "shared"
            GRANT USAGE ON SEQUENCES TO ikaro;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS "shared" CASCADE`);
  }
}
