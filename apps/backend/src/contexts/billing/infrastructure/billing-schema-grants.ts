// Grants the application database role access to a schema, guarded by a role-existence check so
// the migration is order-safe when the infrastructure-created role is provisioned after it
// (docs/ENGINEERING_RULES_BACKEND.md § Migration-driven privilege grants to infrastructure-created
// roles). Mirrors platform's 1700000000000-BootstrapSchemas exactly. Lives outside migrations/
// because TypeORM treats every export of a migration file as a migration class.
export function appRoleGrantSql(schema: string, role: string): string {
  return `
    DO $$ BEGIN
      IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${role}') THEN
        GRANT USAGE ON SCHEMA "${schema}" TO "${role}";
        ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}"
          GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${role}";
        ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}"
          GRANT USAGE ON SEQUENCES TO "${role}";
      END IF;
    END $$;
  `;
}
