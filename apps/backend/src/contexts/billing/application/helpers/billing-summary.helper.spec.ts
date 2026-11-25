import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import {
  ChargeBuilder,
  ChargeLineBuilder,
  FeaturePriceBuilder,
  FeaturePriceVersionBuilder,
  SubscriptionBuilder,
} from '../../../../test/builders/billing';
import type { SelectionEntry } from '../../domain/plan-selection';
import {
  iso,
  priceEntry,
  sumTotal,
  toHistoryItem,
  toOpenCharge,
  toReadySummary,
  toSummaryItems,
  upcomingChanges,
  type PricedEntry,
} from './billing-summary.helper';

const date = (value: string): CalendarDate => CalendarDate.create(value);
const HOTSITE: SelectionEntry = { featureKey: 'HOTSITE', tier: 'STANDARD' };
const BOOKING: SelectionEntry = { featureKey: 'BOOKING', tier: 'STANDARD' };
const NOW = new Date('2026-06-10T12:00:00Z');

const priceWith = (featureKey: 'HOTSITE' | 'BOOKING', versions: ReturnType<typeof version>[]) =>
  new FeaturePriceBuilder().withFeatureKey(featureKey).withVersions(versions).build();
const version = (amountMinor: number, effectiveFrom: string) =>
  new FeaturePriceVersionBuilder()
    .withAmountMinor(amountMinor)
    .withEffectiveFrom(effectiveFrom)
    .build();

describe('iso', () => {
  it('formats a date and passes null through', () => {
    expect(iso(NOW)).toBe('2026-06-10T12:00:00.000Z');
    expect(iso(null)).toBeNull();
  });
});

describe('priceEntry', () => {
  it('reads the amount of the version in force on the date', () => {
    const price = priceWith('HOTSITE', [version(4900, '2026-01-01'), version(5900, '2026-06-01')]);

    expect(priceEntry(HOTSITE, price, date('2026-05-31')).amountMinor).toBe(4900);
    expect(priceEntry(HOTSITE, price, date('2026-06-01')).amountMinor).toBe(5900);
  });

  it('has no amount for a missing price, instead of a zero', () => {
    expect(priceEntry(HOTSITE, null, date('2026-06-10'))).toEqual({
      entry: HOTSITE,
      price: null,
      amountMinor: null,
    });
  });

  it('has no amount when the first version has not started yet', () => {
    const price = priceWith('HOTSITE', [version(4900, '2027-01-01')]);

    expect(priceEntry(HOTSITE, price, date('2026-06-10')).amountMinor).toBeNull();
  });
});

describe('toSummaryItems and sumTotal', () => {
  const priced = (amountMinor: number | null, entry = HOTSITE): PricedEntry => ({
    entry,
    price: null,
    amountMinor,
  });

  it('lists each entry with its unit price', () => {
    expect(toSummaryItems([priced(4900), priced(null, BOOKING)])).toEqual([
      { featureKey: 'HOTSITE', tier: 'STANDARD', unitPriceMinor: 4900 },
      { featureKey: 'BOOKING', tier: 'STANDARD', unitPriceMinor: null },
    ]);
  });

  it('sums the prices', () => {
    expect(sumTotal([priced(4900), priced(2500, BOOKING)])).toBe(7400);
  });

  it('is 0 for an empty selection', () => {
    expect(sumTotal([])).toBe(0);
  });

  it('is null, never a partial total, when any price is missing', () => {
    expect(sumTotal([priced(4900), priced(null, BOOKING)])).toBeNull();
  });
});

describe('upcomingChanges', () => {
  const announced = new Date('2026-05-01T00:00:00Z');
  const pricedFor = (
    entry: SelectionEntry,
    versions: ReturnType<typeof version>[],
    on = '2026-06-10',
  ) => priceEntry(entry, priceWith(entry.featureKey as 'HOTSITE', versions), date(on));

  it('shows an announced version that starts after the date', () => {
    const future = new FeaturePriceVersionBuilder()
      .withAmountMinor(5900)
      .withEffectiveFrom('2026-08-01')
      .withAnnouncedAt(announced)
      .build();

    const changes = upcomingChanges(
      [pricedFor(HOTSITE, [version(4900, '2026-01-01'), future])],
      date('2026-06-10'),
    );

    expect(changes).toEqual([
      {
        featureKey: 'HOTSITE',
        tier: 'STANDARD',
        currentAmountMinor: 4900,
        newAmountMinor: 5900,
        effectiveFrom: '2026-08-01',
      },
    ]);
  });

  it('hides a version the operator created but the fan-out has not announced', () => {
    const unannounced = version(5900, '2026-08-01');

    expect(
      upcomingChanges(
        [pricedFor(HOTSITE, [version(4900, '2026-01-01'), unannounced])],
        date('2026-06-10'),
      ),
    ).toEqual([]);
  });

  it('hides a superseded version', () => {
    const superseded = new FeaturePriceVersionBuilder()
      .withAmountMinor(5900)
      .withEffectiveFrom('2026-08-01')
      .withAnnouncedAt(announced)
      .withSupersededAt(new Date('2026-05-15T00:00:00Z'))
      .build();

    expect(
      upcomingChanges(
        [pricedFor(HOTSITE, [version(4900, '2026-01-01'), superseded])],
        date('2026-06-10'),
      ),
    ).toEqual([]);
  });

  it('hides a version that has already started (it is the current price, not a change)', () => {
    const started = new FeaturePriceVersionBuilder()
      .withAmountMinor(5900)
      .withEffectiveFrom('2026-06-10')
      .withAnnouncedAt(announced)
      .build();

    expect(
      upcomingChanges(
        [pricedFor(HOTSITE, [version(4900, '2026-01-01'), started])],
        date('2026-06-10'),
      ),
    ).toEqual([]);
  });

  it('skips an entry with no price or no price in force', () => {
    const noPrice = priceEntry(HOTSITE, null, date('2026-06-10'));
    const notStarted = pricedFor(BOOKING, [version(4900, '2027-01-01')]);

    expect(upcomingChanges([noPrice, notStarted], date('2026-06-10'))).toEqual([]);
  });

  it('orders by effective date, then by feature key', () => {
    const later = (amountMinor: number, from: string) =>
      new FeaturePriceVersionBuilder()
        .withAmountMinor(amountMinor)
        .withEffectiveFrom(from)
        .withAnnouncedAt(announced)
        .build();
    const hotsite = pricedFor(HOTSITE, [version(4900, '2026-01-01'), later(5000, '2026-09-01')]);
    const bookingPrice = new FeaturePriceBuilder()
      .withFeatureKey('BOOKING')
      .withVersions([version(2500, '2026-01-01'), later(2600, '2026-08-01')])
      .build();
    const booking = priceEntry(BOOKING, bookingPrice, date('2026-06-10'));

    const changes = upcomingChanges([hotsite, booking], date('2026-06-10'));

    expect(changes.map((c) => [c.effectiveFrom, c.featureKey])).toEqual([
      ['2026-08-01', 'BOOKING'],
      ['2026-09-01', 'HOTSITE'],
    ]);
  });

  it('breaks a tie on the same effective date by feature key, whatever the input order', () => {
    const sameDay = (amountMinor: number) =>
      new FeaturePriceVersionBuilder()
        .withAmountMinor(amountMinor)
        .withEffectiveFrom('2026-08-01')
        .withAnnouncedAt(announced)
        .build();
    const hotsite = pricedFor(HOTSITE, [version(4900, '2026-01-01'), sameDay(5000)]);
    const bookingPrice = new FeaturePriceBuilder()
      .withFeatureKey('BOOKING')
      .withVersions([version(2500, '2026-01-01'), sameDay(2600)])
      .build();
    const booking = priceEntry(BOOKING, bookingPrice, date('2026-06-10'));

    const forward = upcomingChanges([hotsite, booking], date('2026-06-10'));
    const reversed = upcomingChanges([booking, hotsite], date('2026-06-10'));

    expect(forward.map((c) => c.featureKey)).toEqual(['BOOKING', 'HOTSITE']);
    expect(reversed.map((c) => c.featureKey)).toEqual(['BOOKING', 'HOTSITE']);
  });
});

describe('toOpenCharge', () => {
  const readyCharge = (expiresAt: Date | null) =>
    new ChargeBuilder()
      .withProviderReady('ASAAS', 'prov-1')
      .withPaymentUrlExpiresAt(expiresAt)
      .build();

  it('maps the money and status fields and never carries the URL itself', () => {
    const charge = new ChargeBuilder()
      .withLines([new ChargeLineBuilder().withUnitPriceMinor(4900).build()])
      .withProviderReady('ASAAS', 'prov-1')
      .build();

    const open = toOpenCharge(charge, NOW);

    expect(open).toEqual({
      id: charge.id,
      kind: 'PERIOD',
      dueDate: charge.dueDate.value,
      subtotalMinor: 4900,
      taxMinor: 0,
      amountMinor: 4900,
      status: 'PENDING',
      hasPaymentLink: true,
      paymentLinkExpiresAt: null,
    });
    expect(JSON.stringify(open)).not.toContain('pay.example');
  });

  it('has no link while the provider has not created the charge yet', () => {
    expect(toOpenCharge(new ChargeBuilder().build(), NOW).hasPaymentLink).toBe(false);
  });

  it('has a link when it never expires', () => {
    expect(toOpenCharge(readyCharge(null), NOW).hasPaymentLink).toBe(true);
  });

  it('has a link before it expires', () => {
    const open = toOpenCharge(readyCharge(new Date('2026-06-10T12:00:01Z')), NOW);

    expect(open.hasPaymentLink).toBe(true);
    expect(open.paymentLinkExpiresAt).toBe('2026-06-10T12:00:01.000Z');
  });

  it('has no link at the expiry instant or after it', () => {
    expect(toOpenCharge(readyCharge(NOW), NOW).hasPaymentLink).toBe(false);
    expect(toOpenCharge(readyCharge(new Date('2026-06-09T00:00:00Z')), NOW).hasPaymentLink).toBe(
      false,
    );
  });
});

describe('toReadySummary', () => {
  const parts = (overrides: Partial<Parameters<typeof toReadySummary>[1]> = {}) => ({
    priced: [
      { entry: HOTSITE, price: null, amountMinor: 4900 },
      { entry: BOOKING, price: null, amountMinor: 2500 },
    ],
    upcoming: [],
    openCharge: null,
    firstChargePaid: false,
    addressRequired: false,
    now: NOW,
    ...overrides,
  });

  it('sums the items and passes the read facts through', () => {
    const subscription = new SubscriptionBuilder().build();

    const summary = toReadySummary(
      subscription,
      parts({ firstChargePaid: true, addressRequired: true }),
    );

    expect(summary).toMatchObject({
      provisioning: false,
      status: subscription.status,
      exempt: false,
      totalMinor: 7400,
      firstChargePaid: true,
      addressRequired: true,
      openCharge: null,
      paymentConfirmationPending: false,
      canDiscard: false,
      autoBilling: { mode: 'NONE', status: 'INACTIVE', label: null },
    });
    expect(summary.items).toHaveLength(2);
  });

  it('owes nothing when exempt, whatever the selection is priced at', () => {
    const summary = toReadySummary(new SubscriptionBuilder().withExempt(true).build(), parts());

    expect(summary.exempt).toBe(true);
    expect(summary.totalMinor).toBe(0);
  });

  it('has no total when a price is missing', () => {
    const summary = toReadySummary(
      new SubscriptionBuilder().build(),
      parts({ priced: [{ entry: HOTSITE, price: null, amountMinor: null }] }),
    );

    expect(summary.totalMinor).toBeNull();
    expect(summary.items[0]?.unitPriceMinor).toBeNull();
  });

  it('shows the open charge and waits for confirmation only after the payment return', () => {
    const waiting = new ChargeBuilder().withPaymentReturnSeenAt(NOW).build();
    const fresh = new ChargeBuilder().build();
    const subscription = new SubscriptionBuilder().build();

    const withReturn = toReadySummary(subscription, parts({ openCharge: waiting }));
    const withoutReturn = toReadySummary(subscription, parts({ openCharge: fresh }));

    expect(withReturn.openCharge?.id).toBe(waiting.id);
    expect(withReturn.paymentConfirmationPending).toBe(true);
    expect(withoutReturn.paymentConfirmationPending).toBe(false);
  });

  it('copies the aggregate dates as ISO strings', () => {
    const trialEnd = new Date('2026-07-01T03:00:00Z');
    const summary = toReadySummary(
      new SubscriptionBuilder().withTrialEndsAt(trialEnd).build(),
      parts(),
    );

    expect(summary.trialEndsAt).toBe(trialEnd.toISOString());
  });
});

describe('toHistoryItem', () => {
  it('maps a paid charge with its lines, method and receipt', () => {
    const paidAt = new Date('2026-06-01T10:00:00Z');
    const charge = new ChargeBuilder()
      .withPeriod('2026-06-01', '2026-07-01')
      .withLines([
        new ChargeLineBuilder().withFeatureKey('HOTSITE').withUnitPriceMinor(4900).build(),
        new ChargeLineBuilder().withFeatureKey('BOOKING').withUnitPriceMinor(2500).build(),
      ])
      .withPaid('PIX', paidAt, 'https://receipts.example/r1')
      .build();

    const item = toHistoryItem(charge);

    expect(item).toMatchObject({
      id: charge.id,
      kind: 'PERIOD',
      periodStart: '2026-06-01',
      periodEnd: '2026-07-01',
      subtotalMinor: 7400,
      taxMinor: 0,
      amountMinor: 7400,
      currency: 'BRL',
      status: 'PAID',
      method: 'PIX',
      paidAt: paidAt.toISOString(),
      receiptUrl: 'https://receipts.example/r1',
      taxLines: [],
    });
    expect(item.lines.map((l) => [l.featureKey, l.unitPriceMinor])).toEqual([
      ['HOTSITE', 4900],
      ['BOOKING', 2500],
    ]);
  });

  it('has no period, method, paid date or receipt for an unpaid recovery charge', () => {
    const item = toHistoryItem(new ChargeBuilder().asRecovery().build());

    expect(item).toMatchObject({
      kind: 'RECOVERY',
      periodStart: null,
      periodEnd: null,
      method: null,
      paidAt: null,
      receiptUrl: null,
    });
  });
});
