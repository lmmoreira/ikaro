import { MigrationInterface, QueryRunner } from 'typeorm';

const SCHEMAS = ['platform', 'customer', 'staff', 'booking', 'loyalty', 'notification'] as const;

export class BootstrapSchemas1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const schema of SCHEMAS) {
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    }

    for (const schema of SCHEMAS) {
      await queryRunner.query(`
        DO $$ BEGIN
          IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ikaro_app') THEN
            GRANT USAGE ON SCHEMA "${schema}" TO ikaro_app;
            ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}"
              GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ikaro_app;
            ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}"
              GRANT USAGE ON SEQUENCES TO ikaro_app;
          END IF;
        END $$;
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const schema of [...SCHEMAS].reverse()) {
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    }
  }
}
