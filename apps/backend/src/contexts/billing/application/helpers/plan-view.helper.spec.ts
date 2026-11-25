import { localDateStartUTC } from '../../../../shared/utils/calendar-date';
import { SubscriptionBuilder, SubscriptionItemBuilder } from '../../../../test/builders/billing';
import { toCatalogFeatures, toPlanView } from './plan-view.helper';
import type { SelectablePriceItem } from './selectable-prices.helper';

const ZONE = 'America/Sao_Paulo';
const NOW = new Date('2026-11-12T15:00:00.000Z');
const LONG_AGO = new Date('2026-01-01T00:00:00.000Z');

const selectable = (
  featureKey: SelectablePriceItem['featureKey'],
  tier: SelectablePriceItem['tier'],
  amountMinor: number,
  upcoming?: SelectablePriceItem['upcoming'],
): SelectablePriceItem => ({
  featureKey,
  tier,
  cycle: 'MONTHLY',
  currency: 'BRL',
  amountMinor,
  effectiveFrom: '2026-01-01',
  ...(upcoming && { upcoming }),
});

describe('toCatalogFeatures', () => {
  it('lists every feature in catalogue order with the tiers it is sold in', () => {
    const features = toCatalogFeatures([]);

    expect(features.map((feature) => feature.featureKey)).toEqual([
      'HOTSITE',
      'BOOKING',
      'LOYALTY',
      'CHATBOT',
      'LEAD_FORM',
    ]);
    expect(
      features.find((feature) => feature.featureKey === 'CHATBOT')?.tiers.map((t) => t.tier),
    ).toEqual(['BASIC', 'PLUS']);
    expect(features.every((feature) => feature.tiers.every((tier) => !tier.available))).toBe(true);
  });

  it('gives each requirement list its own copy, so a caller cannot change the domain table', () => {
    const [hotsite, booking] = toCatalogFeatures([]);

    booking.requires.push('LOYALTY');

    expect(toCatalogFeatures([])[1].requires).toEqual(['HOTSITE']);
    expect(hotsite.requires).toEqual([]);
  });

  it('prices a tier from the selectable list and carries its announced next price', () => {
    const features = toCatalogFeatures([
      selectable('BOOKING', 'STANDARD', 3900, { amountMinor: 4900, effectiveFrom: '2026-12-01' }),
      selectable('CHATBOT', 'PLUS', 7900),
    ]);

    expect(features[1].tiers[0]).toEqual({
      tier: 'STANDARD',
      unitPriceMinor: 3900,
      available: true,
      upcoming: { amountMinor: 4900, effectiveFrom: '2026-12-01' },
    });
    expect(features[3].tiers).toEqual([
      { tier: 'BASIC', unitPriceMinor: null, available: false },
      { tier: 'PLUS', unitPriceMinor: 7900, available: true },
    ]);
  });
});

describe('toPlanView', () => {
  const item = (featureKey: 'HOTSITE' | 'BOOKING' | 'LEAD_FORM') =>
    new SubscriptionItemBuilder().withFeatureKey(featureKey).withStartsAt(LONG_AGO);

  it('does not mistake a removal for a replacement: only a later item of the same feature replaces', () => {
    const change = localDateStartUTC('2026-11-20', ZONE);
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withTimezone(ZONE)
      .withItems([
        item('HOTSITE').build(),
        item('BOOKING').withEndsAt(change).build(),
        item('LEAD_FORM').withStartsAt(change).build(),
      ])
      .build();

    expect(toPlanView(subscription, NOW).scheduled).toEqual([
      { featureKey: 'BOOKING', tier: null, startsAt: '2026-11-20' },
      { featureKey: 'LEAD_FORM', tier: 'STANDARD', startsAt: '2026-11-20' },
    ]);
  });

  it('dates in the tenant timezone, not UTC: local midnight is 03:00Z', () => {
    const change = localDateStartUTC('2026-11-20', ZONE);
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withTimezone(ZONE)
      .withItems([item('HOTSITE').withEndsAt(change).build(), item('LEAD_FORM').build()])
      .build();

    const { current } = toPlanView(subscription, NOW);

    expect(change.toISOString()).toBe('2026-11-20T03:00:00.000Z');
    expect(current.find((entry) => entry.featureKey === 'HOTSITE')?.endsAt).toBe('2026-11-20');
  });

  it('orders what is scheduled by date, then by catalogue order', () => {
    const early = localDateStartUTC('2026-11-20', ZONE);
    const late = localDateStartUTC('2026-12-20', ZONE);
    const subscription = new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withTimezone(ZONE)
      .withItems([
        item('HOTSITE').build(),
        item('LEAD_FORM').withStartsAt(early).build(),
        item('BOOKING').withStartsAt(late).build(),
      ])
      .build();

    expect(toPlanView(subscription, NOW).scheduled?.map((entry) => entry.featureKey)).toEqual([
      'LEAD_FORM',
      'BOOKING',
    ]);
  });
});
