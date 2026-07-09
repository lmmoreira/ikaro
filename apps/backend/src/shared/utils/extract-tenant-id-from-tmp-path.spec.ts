import { extractTenantIdFromTmpPath } from './extract-tenant-id-from-tmp-path';

describe('extractTenantIdFromTmpPath', () => {
  it('extracts the tenant ID from a hotsite tmp upload path', () => {
    expect(extractTenantIdFromTmpPath('tmp/tenant-1/branding/uuid-1/logo.png')).toBe('tenant-1');
  });

  it('extracts the tenant ID from a booking tmp upload path', () => {
    expect(extractTenantIdFromTmpPath('tmp/tenant-1/uuid-1/car.jpg')).toBe('tenant-1');
  });

  it('returns null for a path that does not start with tmp/<id>/', () => {
    expect(extractTenantIdFromTmpPath('tenants/tenant-1/hotsite/branding/logo.png')).toBeNull();
  });

  it('returns null for a bare tmp/<id> path with no trailing segment', () => {
    expect(extractTenantIdFromTmpPath('tmp/tenant-1')).toBeNull();
  });
});
