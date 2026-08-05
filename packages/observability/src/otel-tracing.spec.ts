import { isHealthCheckPath } from './otel-tracing';

describe('isHealthCheckPath', () => {
  it('matches backend health-check paths (no global prefix)', () => {
    expect(isHealthCheckPath('/health/live')).toBe(true);
    expect(isHealthCheckPath('/health/ready')).toBe(true);
  });

  it('matches BFF health-check paths (global v1 prefix) — the original bug this fixes', () => {
    expect(isHealthCheckPath('/v1/health/live')).toBe(true);
    expect(isHealthCheckPath('/v1/health/ready')).toBe(true);
  });

  it('does not match a real route whose query string happens to contain a health-check-looking value — the .includes() regression this fixes', () => {
    expect(isHealthCheckPath('/v1/bookings?redirect=/health/live')).toBe(false);
    expect(
      isHealthCheckPath('/services/019f9e4e-7d01-74ad-ae3f-4bf4450b2e92?next=/v1/health/ready'),
    ).toBe(false);
  });

  it('does not match unrelated real routes', () => {
    expect(isHealthCheckPath('/staff/me/status')).toBe(false);
    expect(isHealthCheckPath('/v1/tenants/settings')).toBe(false);
    expect(isHealthCheckPath('/bookings?status=APPROVED&limit=20')).toBe(false);
  });

  it('handles undefined/empty url without throwing', () => {
    expect(isHealthCheckPath(undefined)).toBe(false);
    expect(isHealthCheckPath('')).toBe(false);
  });
});
