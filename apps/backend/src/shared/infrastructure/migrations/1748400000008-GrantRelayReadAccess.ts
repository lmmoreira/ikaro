import { MigrationInterface, QueryRunner } from 'typeorm';

const RELAY_READ_GRANTS_SQL = `
  DO $$
  DECLARE
    relay_role name;
    schema_name text;
  BEGIN
    FOR relay_role IN
      SELECT rolname
      FROM pg_catalog.pg_roles
      WHERE rolname LIKE 'ikaro-relay-vm@%.iam'
    LOOP
      FOREACH schema_name IN ARRAY ARRAY[
        'platform', 'customer', 'staff', 'booking', 'loyalty',
        'notification', 'shared'
      ]
      LOOP
        IF EXISTS (
          SELECT 1
          FROM pg_catalog.pg_namespace
          WHERE nspname = schema_name
        ) THEN
          EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', schema_name, relay_role);
          EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO %I', schema_name, relay_role);
          EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I', schema_name, relay_role);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT ON TABLES TO %I', schema_name, relay_role);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO %I', schema_name, relay_role);
        END IF;
      END LOOP;
    END LOOP;
  END
  $$;
`;

const REVOKE_RELAY_READ_GRANTS_SQL = `
  DO $$
  DECLARE
    relay_role name;
    schema_name text;
  BEGIN
    FOR relay_role IN
      SELECT rolname
      FROM pg_catalog.pg_roles
      WHERE rolname LIKE 'ikaro-relay-vm@%.iam'
    LOOP
      FOREACH schema_name IN ARRAY ARRAY[
        'platform', 'customer', 'staff', 'booking', 'loyalty',
        'notification', 'shared'
      ]
      LOOP
        IF EXISTS (
          SELECT 1
          FROM pg_catalog.pg_namespace
          WHERE nspname = schema_name
        ) THEN
          EXECUTE format('REVOKE USAGE ON SCHEMA %I FROM %I', schema_name, relay_role);
          EXECUTE format('REVOKE SELECT ON ALL TABLES IN SCHEMA %I FROM %I', schema_name, relay_role);
          EXECUTE format('REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I FROM %I', schema_name, relay_role);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE SELECT ON TABLES FROM %I', schema_name, relay_role);
          EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA %I REVOKE USAGE, SELECT ON SEQUENCES FROM %I', schema_name, relay_role);
        END IF;
      END LOOP;
    END LOOP;
  END
  $$;
`;

export class GrantRelayReadAccess1748400000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(RELAY_READ_GRANTS_SQL);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(REVOKE_RELAY_READ_GRANTS_SQL);
  }
}
