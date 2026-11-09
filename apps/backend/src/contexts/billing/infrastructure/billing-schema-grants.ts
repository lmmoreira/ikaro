// Grants the application database role access to a schema. Mirrors platform's
// 1700000000000-BootstrapSchemas exactly: the role-existence check only keeps the migration from
// failing on a database that has no such role (a bare local database). It is NOT convergent: if
// the role is created after this runs, nothing is granted retroactively, so the role must exist
// before the migrate job runs (docs/ENGINEERING_RULES_BACKEND.md § Migration-driven privilege
// grants to infrastructure-created roles; recovery recipe: docs/RUNBOOKS.md § Debugging a
// permission-denied-shaped 500). Lives outside migrations/ because TypeORM treats every export of
// a migration file as a migration class.
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
