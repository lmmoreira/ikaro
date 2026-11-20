import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { SubscriptionBuilder } from '../../../test/builders/billing';
import { chargePriceKey } from './charge-price-key';
import { ChargeInvariantError } from './errors/billing-domain.error';
import { PeriodChargeFactory } from './period-charge.factory';
import type { IssuedPeriodWindow } from './subscription-issue-window';
import { MinorAmount } from './value-objects/minor-amount.vo';

const WINDOW: IssuedPeriodWindow = {
  periodStart: CalendarDate.create('2026-04-15'),
  periodEnd: CalendarDate.create('2026-05-14'),
  nextDueDate: CalendarDate.create('2026-05-15'),
};

const prices = new Map<string, MinorAmount>([
  [chargePriceKey('HOTSITE', 'STANDARD'), MinorAmount.create(4900, 'BRL')],
  [chargePriceKey('CHATBOT', 'PLUS'), MinorAmount.create(7900, 'BRL')],
]);

const build = (items: Array<{ featureKey: 'HOTSITE' | 'CHATBOT'; tier: 'STANDARD' | 'PLUS' }>) =>
  PeriodChargeFactory.build({
    subscription: new SubscriptionBuilder().withCountryCode('BR').withCurrency('BRL').build(),
    items,
    prices,
    window: WINDOW,
  });

describe('PeriodChargeFactory', () => {
  it('builds a PENDING PERIOD charge for the period, due on its first day', () => {
    const charge = build([
      { featureKey: 'HOTSITE', tier: 'STANDARD' },
      { featureKey: 'CHATBOT', tier: 'PLUS' },
    ]);

    expect(charge.kind).toBe('PERIOD');
    expect(charge.status).toBe('PENDING');
    expect(charge.providerCreationStatus).toBe('PENDING');
    expect(charge.periodStart?.value).toBe('2026-04-15');
    expect(charge.periodEnd?.value).toBe('2026-05-14');
    expect(charge.dueDate.value).toBe('2026-04-15');
    expect(charge.amount.currency).toBe('BRL');
  });

  it('snapshots one line per item at the price it was given and sums them', () => {
    const charge = build([
      { featureKey: 'HOTSITE', tier: 'STANDARD' },
      { featureKey: 'CHATBOT', tier: 'PLUS' },
    ]);

    expect(charge.lines.map((line) => [line.featureKey, line.tier, line.unitPriceMinor])).toEqual([
      ['HOTSITE', 'STANDARD', 4900],
      ['CHATBOT', 'PLUS', 7900],
    ]);
    expect(charge.amount.amountMinor).toBe(12800);
  });

  it('copies the merchant profile and ids of the subscription', () => {
    const subscription = new SubscriptionBuilder().build();

    const charge = PeriodChargeFactory.build({
      subscription,
      items: [{ featureKey: 'HOTSITE', tier: 'STANDARD' }],
      prices,
      window: WINDOW,
    });

    expect(charge.tenantId).toBe(subscription.tenantId);
    expect(charge.subscriptionId).toBe(subscription.id);
    expect(charge.merchantProfileKey).toBe(subscription.merchantProfileKey);
  });

  it('never answers a missing price with a zero', () => {
    expect(() => build([{ featureKey: 'CHATBOT', tier: 'STANDARD' }])).toThrow(
      ChargeInvariantError,
    );
  });
});
