import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { ChargeLineBuilder } from '../../../test/builders/billing';
import { assertChargeShape } from './charge-shape';
import type { NewChargeInput } from './charge.types';
import { ChargeInvariantError } from './errors/billing-domain.error';

const date = (value: string): CalendarDate => CalendarDate.create(value);

function periodInput(overrides: Partial<NewChargeInput> = {}): NewChargeInput {
  return {
    tenantId: 'tenant-1',
    subscriptionId: 'sub-1',
    merchantProfileKey: 'BRL_FAKE',
    kind: 'PERIOD',
    periodStart: date('2026-03-10'),
    periodEnd: date('2026-04-09'),
    dueDate: date('2026-03-10'),
    lines: [new ChargeLineBuilder().build()],
    currency: 'BRL',
    ...overrides,
  };
}

describe('assertChargeShape', () => {
  it('accepts a PERIOD charge with both dates and a RECOVERY charge with none', () => {
    expect(() => assertChargeShape(periodInput())).not.toThrow();
    expect(() =>
      assertChargeShape(periodInput({ kind: 'RECOVERY', periodStart: null, periodEnd: null })),
    ).not.toThrow();
  });

  it('refuses a charge with no lines', () => {
    expect(() => assertChargeShape(periodInput({ lines: [] }))).toThrow(ChargeInvariantError);
  });

  it('refuses a line priced in another currency than the charge', () => {
    const usdLine = new ChargeLineBuilder().withCurrency('USD').build();

    expect(() => assertChargeShape(periodInput({ lines: [usdLine] }))).toThrow(
      'Every line must be priced in BRL',
    );
  });

  it.each([
    ['no start', { periodStart: null }],
    ['no end', { periodEnd: null }],
  ])('refuses a PERIOD charge with %s', (_label, overrides) => {
    expect(() => assertChargeShape(periodInput(overrides))).toThrow(
      'A PERIOD charge needs both period dates',
    );
  });

  it.each([
    ['a start', { periodStart: date('2026-03-10') }],
    ['an end', { periodEnd: date('2026-04-09') }],
  ])(
    'refuses a RECOVERY charge with %s: its period lives on the subscription',
    (_label, overrides) => {
      expect(() =>
        assertChargeShape(
          periodInput({ kind: 'RECOVERY', periodStart: null, periodEnd: null, ...overrides }),
        ),
      ).toThrow('A RECOVERY charge has no period dates');
    },
  );
});
