import { CalendarDate } from '../../../../shared/value-objects/calendar-date.vo';
import { FeaturePriceBuilder, FeaturePriceVersionBuilder } from '../../../../test/builders/billing';
import { projectSelectablePrices } from './selectable-prices.helper';

const day = (value: string): CalendarDate => CalendarDate.create(value);
const announced = new Date('2026-05-01T00:00:00Z');

describe('projectSelectablePrices', () => {
  it('lists the amount in force and omits a price with no version started', () => {
    const started = new FeaturePriceBuilder()
      .withVersions([new FeaturePriceVersionBuilder().withAmountMinor(4900).build()])
      .build();
    const notStarted = new FeaturePriceBuilder()
      .withFeatureKey('BOOKING')
      .withVersions([new FeaturePriceVersionBuilder().withEffectiveFrom('2027-01-01').build()])
      .build();

    const items = projectSelectablePrices([started, notStarted], day('2026-03-15'));

    expect(items).toEqual([
      {
        featureKey: 'HOTSITE',
        tier: 'STANDARD',
        cycle: 'MONTHLY',
        currency: 'BRL',
        amountMinor: 4900,
        effectiveFrom: '2026-01-01',
      },
    ]);
  });

  it('adds only the earliest announced future version as `upcoming`', () => {
    const price = new FeaturePriceBuilder()
      .withVersions([
        new FeaturePriceVersionBuilder().withAmountMinor(4900).build(),
        new FeaturePriceVersionBuilder()
          .withEffectiveFrom('2026-07-01')
          .withAmountMinor(5900)
          .withAnnouncedAt(announced)
          .build(),
        new FeaturePriceVersionBuilder()
          .withEffectiveFrom('2026-09-01')
          .withAmountMinor(6900)
          .withAnnouncedAt(announced)
          .build(),
      ])
      .build();

    const [item] = projectSelectablePrices([price], day('2026-03-15'));

    expect(item.amountMinor).toBe(4900);
    expect(item.upcoming).toEqual({ amountMinor: 5900, effectiveFrom: '2026-07-01' });
  });

  it('has no `upcoming` for an unannounced or a superseded future version', () => {
    const price = new FeaturePriceBuilder()
      .withVersions([
        new FeaturePriceVersionBuilder().withAmountMinor(4900).build(),
        new FeaturePriceVersionBuilder()
          .withEffectiveFrom('2026-07-01')
          .withAmountMinor(5900)
          .withAnnouncedAt(null)
          .build(),
        new FeaturePriceVersionBuilder()
          .withEffectiveFrom('2026-09-01')
          .withAmountMinor(6900)
          .withAnnouncedAt(announced)
          .withSupersededAt(new Date('2026-06-01T00:00:00Z'))
          .build(),
      ])
      .build();

    const [item] = projectSelectablePrices([price], day('2026-03-15'));

    expect(item).not.toHaveProperty('upcoming');
  });
});
