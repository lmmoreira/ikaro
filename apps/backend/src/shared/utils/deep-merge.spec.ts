import { deepMerge } from './deep-merge';

describe('deepMerge', () => {
  it('merges a nested field without wiping sibling fields', () => {
    const base = { loyalty: { expiry_days: 180, enable_notifications: true } };
    const result = deepMerge(base, { loyalty: { expiry_days: 365 } });

    expect(result.loyalty.expiry_days).toBe(365);
    expect(result.loyalty.enable_notifications).toBe(true);
  });

  it('sets a null override value (e.g. closing a business_hours day)', () => {
    const base = { business_hours: { monday: { open: '09:00', close: '18:00' }, sunday: null } };
    const result = deepMerge(base, { business_hours: { monday: null } } as never);

    expect(result.business_hours.monday).toBeNull();
    expect(result.business_hours.sunday).toBeNull();
  });

  it('replaces arrays entirely rather than concatenating them', () => {
    const base = { layout: ['HERO', 'GALLERY'] };
    const result = deepMerge(base, { layout: ['HERO'] });

    expect(result.layout).toEqual(['HERO']);
  });

  it('does not mutate the base object', () => {
    const base = { a: { b: 1 } };
    deepMerge(base, { a: { b: 2 } });

    expect(base.a.b).toBe(1);
  });

  it('merges multiple top-level keys independently', () => {
    const base = { loyalty: { expiry_days: 180 }, booking: { cancellation_window_hours: 48 } };
    const result = deepMerge(base, { booking: { cancellation_window_hours: 24 } });

    expect(result.loyalty.expiry_days).toBe(180);
    expect(result.booking.cancellation_window_hours).toBe(24);
  });
});
