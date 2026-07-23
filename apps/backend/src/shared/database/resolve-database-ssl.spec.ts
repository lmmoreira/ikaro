import { resolveDatabaseSsl } from './resolve-database-ssl';

describe('resolveDatabaseSsl', () => {
  it('returns undefined for local (no SSL — local/CI Postgres has none)', () => {
    expect(resolveDatabaseSsl('local')).toBeUndefined();
  });

  it('returns rejectUnauthorized: false for staging', () => {
    expect(resolveDatabaseSsl('staging')).toEqual({ rejectUnauthorized: false });
  });

  it('returns rejectUnauthorized: false for production', () => {
    expect(resolveDatabaseSsl('production')).toEqual({ rejectUnauthorized: false });
  });
});
