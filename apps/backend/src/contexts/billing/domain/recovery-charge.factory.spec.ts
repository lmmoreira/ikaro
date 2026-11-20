import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { SubscriptionBuilder } from '../../../test/builders/billing';
import { RECOVERY_CHARGE_DUE_DAYS } from './billing-constants';
import { ChargeInvariantError } from './errors/billing-domain.error';
import { chargePriceKey } from './charge-price-key';
import { RecoveryChargeFactory } from './recovery-charge.factory';
import type { Subscription } from './subscription.aggregate';
import { MinorAmount } from './value-objects/minor-amount.vo';

const subscription = (): Subscription =>
  new SubscriptionBuilder()
    .withTenantId('0197a2b0-0000-7000-8000-0000000000aa')
    .withCountryCode('BR')
    .withCurrency('BRL')
    .build();

const prices = new Map<string, MinorAmount>([
  [chargePriceKey('HOTSITE', 'STANDARD'), MinorAmount.create(4900, 'BRL')],
  [chargePriceKey('BOOKING', 'STANDARD'), MinorAmount.create(10900, 'BRL')],
  [chargePriceKey('CHATBOT', 'PLUS'), MinorAmount.create(7900, 'BRL')],
]);

const input = (today: string, items = [{ featureKey: 'HOTSITE', tier: 'STANDARD' }]) => ({
  subscription: subscription(),
  items: items as { featureKey: 'HOTSITE'; tier: 'STANDARD' }[],
  prices,
  today: CalendarDate.create(today),
});

describe('RecoveryChargeFactory', () => {
  it('builds a PENDING RECOVERY charge from the prices it is given', () => {
    const charge = RecoveryChargeFactory.build(
      input('2026-03-10', [
        { featureKey: 'HOTSITE', tier: 'STANDARD' },
        { featureKey: 'BOOKING', tier: 'STANDARD' },
      ]),
    );

    expect(charge.kind).toBe('RECOVERY');
    expect(charge.status).toBe('PENDING');
    expect(charge.lines.map((line) => [line.featureKey, line.unitPriceMinor])).toEqual([
      ['HOTSITE', 4900],
      ['BOOKING', 10900],
    ]);
    expect(charge.amount.amountMinor).toBe(15800);
    expect(charge.subtotal.amountMinor).toBe(15800);
  });

  it('has no period dates: the period lives on the subscription', () => {
    const charge = RecoveryChargeFactory.build(input('2026-03-10'));

    expect(charge.periodStart).toBeNull();
    expect(charge.periodEnd).toBeNull();
  });

  it('copies the subscription identity, currency and merchant profile key', () => {
    const sub = subscription();

    const charge = RecoveryChargeFactory.build({ ...input('2026-03-10'), subscription: sub });

    expect(charge.tenantId).toBe(sub.tenantId);
    expect(charge.subscriptionId).toBe(sub.id);
    expect(charge.merchantProfileKey).toBe('BRL_FAKE');
    expect(charge.amount.currency).toBe('BRL');
  });

  it('is due today + RECOVERY_CHARGE_DUE_DAYS (7), counted on the date it is given', () => {
    expect(RECOVERY_CHARGE_DUE_DAYS).toBe(7);

    const charge = RecoveryChargeFactory.build(input('2026-03-10'));

    expect(charge.dueDate.value).toBe('2026-03-17');
  });

  it.each([
    ['a month end', '2026-01-28', '2026-02-04'],
    ['a year end', '2026-12-28', '2027-01-04'],
    ['a leap day', '2028-02-25', '2028-03-03'],
  ])('crosses %s correctly', (_name, today, due) => {
    expect(RecoveryChargeFactory.build(input(today)).dueDate.value).toBe(due);
  });

  it('refuses a missing price instead of billing a zero', () => {
    const missing = { ...input('2026-03-10'), prices: new Map<string, MinorAmount>() };

    expect(() => RecoveryChargeFactory.build(missing)).toThrow(ChargeInvariantError);
    expect(() => RecoveryChargeFactory.build(missing)).toThrow('No price resolved for HOTSITE');
  });

  it('refuses a charge with no item', () => {
    expect(() => RecoveryChargeFactory.build(input('2026-03-10', []))).toThrow(
      ChargeInvariantError,
    );
  });
});
