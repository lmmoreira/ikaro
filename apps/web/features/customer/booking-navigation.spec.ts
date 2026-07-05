import { describe, expect, it } from 'vitest';
import { appendReturnTo, resolveReturnTo } from './booking-navigation';

describe('customer booking navigation helpers', () => {
  it('validates my-account return urls for the current tenant only', () => {
    expect(resolveReturnTo('/lavacar-bh/my-account/loyalty', 'lavacar-bh')).toBe(
      '/lavacar-bh/my-account/loyalty',
    );
    expect(resolveReturnTo('/lavacar-bh/my-account/bookings', 'lavacar-bh')).toBe(
      '/lavacar-bh/my-account/bookings',
    );
  });

  it('rejects a returnTo scoped to a different tenant', () => {
    expect(resolveReturnTo('/other-tenant/my-account/loyalty', 'lavacar-bh')).toBeNull();
  });

  it('rejects a returnTo outside the my-account tree', () => {
    expect(resolveReturnTo('/lavacar-bh/booking', 'lavacar-bh')).toBeNull();
  });

  it('rejects undefined', () => {
    expect(resolveReturnTo(undefined, 'lavacar-bh')).toBeNull();
  });

  it('appends returnTo query params when present', () => {
    expect(
      appendReturnTo('/lavacar-bh/my-account/bookings/123', '/lavacar-bh/my-account/loyalty'),
    ).toBe('/lavacar-bh/my-account/bookings/123?returnTo=%2Flavacar-bh%2Fmy-account%2Floyalty');
  });

  it('returns the path unchanged when returnTo is null', () => {
    expect(appendReturnTo('/lavacar-bh/my-account/bookings/123', null)).toBe(
      '/lavacar-bh/my-account/bookings/123',
    );
  });
});
