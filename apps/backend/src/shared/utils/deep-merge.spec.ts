import { deepMerge } from './deep-merge';

describe('deepMerge', () => {
  it('merges a nested field without wiping sibling fields', () => {
    const base = { loyalty: { expiryDays: 180, enableNotifications: true } };
    const result = deepMerge(base, { loyalty: { expiryDays: 365 } });

    expect(result.loyalty.expiryDays).toBe(365);
    expect(result.loyalty.enableNotifications).toBe(true);
  });

  it('sets a null override value (e.g. closing a businessHours day)', () => {
    const base = { businessHours: { monday: { open: '09:00', close: '18:00' }, sunday: null } };
    const result = deepMerge(base, { businessHours: { monday: null } } as never);

    expect(result.businessHours.monday).toBeNull();
    expect(result.businessHours.sunday).toBeNull();
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
    const base = { loyalty: { expiryDays: 180 }, booking: { cancellationWindowHours: 48 } };
    const result = deepMerge(base, { booking: { cancellationWindowHours: 24 } });

    expect(result.loyalty.expiryDays).toBe(180);
    expect(result.booking.cancellationWindowHours).toBe(24);
  });

  it('strips prototype-pollution keys from override without affecting Object.prototype', () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":true},"loyalty":{"expiryDays":999}}');
    const base = { loyalty: { expiryDays: 180 } };

    const result = deepMerge(base, malicious);

    expect((Object.prototype as Record<string, unknown>)['polluted']).toBeUndefined();
    expect(result.loyalty.expiryDays).toBe(999);
  });
});
