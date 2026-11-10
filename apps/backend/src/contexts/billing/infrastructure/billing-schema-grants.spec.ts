import { appRoleGrantSql } from './billing-schema-grants';

describe('appRoleGrantSql', () => {
  const sql = appRoleGrantSql('billing', 'ikaro');

  it('is guarded by a role-existence check so the migration is order-safe', () => {
    expect(sql).toContain(`IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'ikaro')`);
  });

  it('grants schema usage plus default table and sequence privileges to the role', () => {
    expect(sql).toContain('GRANT USAGE ON SCHEMA "billing" TO "ikaro"');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "ikaro"');
    expect(sql).toContain('GRANT USAGE ON SEQUENCES TO "ikaro"');
  });
});
