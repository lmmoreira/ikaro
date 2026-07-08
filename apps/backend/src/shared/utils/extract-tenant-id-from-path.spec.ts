import { extractTenantIdFromPath } from './extract-tenant-id-from-path';

describe('extractTenantIdFromPath', () => {
  it('extracts the tenant ID from a hotsite image path', () => {
    expect(extractTenantIdFromPath('tenants/tenant-1/hotsite/branding/logo.png')).toBe('tenant-1');
  });

  it('extracts the tenant ID from a booking attachment path', () => {
    expect(extractTenantIdFromPath('tenants/tenant-1/bookings/booking-1/after-1.jpg')).toBe(
      'tenant-1',
    );
  });

  it('returns null for a path that does not start with tenants/<id>/', () => {
    expect(extractTenantIdFromPath('uploads/some-file.jpg')).toBeNull();
  });

  it('returns null for a bare tenants/<id> path with no trailing segment', () => {
    expect(extractTenantIdFromPath('tenants/tenant-1')).toBeNull();
  });
});
