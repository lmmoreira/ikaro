import { SubscriptionItemBuilder } from '../../../test/builders/billing';
import { SubscriptionInvariantError } from './errors/billing-domain.error';
import { SubscriptionItem } from './subscription-item';

const at = (iso: string): Date => new Date(iso);

describe('SubscriptionItem', () => {
  describe('create', () => {
    it('generates an id and requires a createdBy (an operator id, an actor id or SYSTEM)', () => {
      const item = SubscriptionItem.create({
        featureKey: 'BOOKING',
        tier: 'STANDARD',
        startsAt: at('2026-01-01T00:00:00Z'),
        endsAt: null,
        createdBy: 'SYSTEM',
      });
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(item.createdBy).toBe('SYSTEM');
      expect(() =>
        SubscriptionItem.create({
          featureKey: 'BOOKING',
          tier: 'STANDARD',
          startsAt: at('2026-01-01T00:00:00Z'),
          endsAt: null,
          createdBy: '  ',
        }),
      ).toThrow(SubscriptionInvariantError);
    });

    it('rejects a tier the feature is not sold at and a window that ends before it starts', () => {
      expect(() =>
        SubscriptionItem.create({
          featureKey: 'BOOKING',
          tier: 'PLUS',
          startsAt: at('2026-01-01T00:00:00Z'),
          endsAt: null,
          createdBy: 'SYSTEM',
        }),
      ).toThrow(SubscriptionInvariantError);
      expect(() =>
        SubscriptionItem.create({
          featureKey: 'BOOKING',
          tier: 'STANDARD',
          startsAt: at('2026-01-02T00:00:00Z'),
          endsAt: at('2026-01-01T00:00:00Z'),
          createdBy: 'SYSTEM',
        }),
      ).toThrow(SubscriptionInvariantError);
    });
  });

  describe('isActiveAt', () => {
    const now = at('2026-03-01T12:00:00Z');

    it('is active when startsAt <= now and the item is open-ended', () => {
      expect(
        new SubscriptionItemBuilder()
          .withStartsAt(at('2026-02-01T00:00:00Z'))
          .build()
          .isActiveAt(now),
      ).toBe(true);
    });

    it('is active at the exact instant it starts', () => {
      expect(new SubscriptionItemBuilder().withStartsAt(now).build().isActiveAt(now)).toBe(true);
    });

    it('is not active before it starts', () => {
      const item = new SubscriptionItemBuilder().withStartsAt(at('2026-03-02T00:00:00Z')).build();
      expect(item.isActiveAt(now)).toBe(false);
      expect(item.startsAfter(now)).toBe(true);
    });

    it('is not active at the exact instant it ends (the window is half-open)', () => {
      const item = new SubscriptionItemBuilder()
        .withStartsAt(at('2026-02-01T00:00:00Z'))
        .withEndsAt(now)
        .build();
      expect(item.isActiveAt(now)).toBe(false);
      expect(item.isActiveAt(at('2026-03-01T11:59:59Z'))).toBe(true);
    });
  });

  describe('overlaps', () => {
    const item = (feature: 'BOOKING' | 'HOTSITE', start: string, end: string | null) =>
      new SubscriptionItemBuilder()
        .withFeatureKey(feature)
        .withStartsAt(at(start))
        .withEndsAt(end === null ? null : at(end))
        .build();

    it('detects overlapping windows of one feature', () => {
      expect(
        item('BOOKING', '2026-01-01T00:00:00Z', null).overlaps(
          item('BOOKING', '2026-06-01T00:00:00Z', null),
        ),
      ).toBe(true);
    });

    it('lets touching windows coexist: [a,b) and [b,c)', () => {
      const first = item('BOOKING', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z');
      const second = item('BOOKING', '2026-02-01T00:00:00Z', null);
      expect(first.overlaps(second)).toBe(false);
      expect(second.overlaps(first)).toBe(false);
    });

    it('never overlaps a window of another feature', () => {
      expect(
        item('BOOKING', '2026-01-01T00:00:00Z', null).overlaps(
          item('HOTSITE', '2026-01-01T00:00:00Z', null),
        ),
      ).toBe(false);
    });
  });

  describe('endedAt', () => {
    it('returns a new item with the same id, ended', () => {
      const original = new SubscriptionItemBuilder()
        .withStartsAt(at('2026-01-01T00:00:00Z'))
        .build();
      const ended = original.endedAt(at('2026-02-01T00:00:00Z'));
      expect(ended.id).toBe(original.id);
      expect(ended.endsAt).toEqual(at('2026-02-01T00:00:00Z'));
      expect(original.endsAt).toBeNull();
    });

    it('refuses an end at or before the start', () => {
      const original = new SubscriptionItemBuilder()
        .withStartsAt(at('2026-01-01T00:00:00Z'))
        .build();
      expect(() => original.endedAt(at('2026-01-01T00:00:00Z'))).toThrow(
        SubscriptionInvariantError,
      );
    });
  });
});
