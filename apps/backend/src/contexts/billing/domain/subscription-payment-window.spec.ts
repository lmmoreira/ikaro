import { Timezone } from '../../../shared/value-objects/timezone.vo';
import { recoveryPaymentWindow } from './subscription-payment-window';

const SAO_PAULO = Timezone.create('America/Sao_Paulo'); // UTC-3, no DST
const at = (iso: string): Date => new Date(iso);

// The last millisecond of a São Paulo local day: 23:59:59.999 local = 02:59:59.999Z the next day.
const endOfLocalDay = (isoDay: string): Date => {
  const next = at(`${isoDay}T03:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return new Date(next.getTime() - 1);
};

describe('recoveryPaymentWindow', () => {
  it('renews on the payment day, the next month, and ends the day before', () => {
    const window = recoveryPaymentWindow(at('2026-11-19T15:00:00Z'), SAO_PAULO);

    expect(window.anchorDay).toBe(19);
    expect(window.nextDueDate.value).toBe('2026-12-19');
    expect(window.periodEnd).toEqual(endOfLocalDay('2026-12-18'));
  });

  it("uses the payment's tenant-local day, not the UTC day", () => {
    // 2026-03-01T02:00Z is still 2026-02-28 23:00 in São Paulo.
    const window = recoveryPaymentWindow(at('2026-03-01T02:00:00Z'), SAO_PAULO);

    expect(window.anchorDay).toBe(28);
    expect(window.nextDueDate.value).toBe('2026-03-28');
  });

  it.each([
    ['2026-01-29T15:00:00Z', 28, '2026-02-28'],
    ['2026-01-30T15:00:00Z', 28, '2026-02-28'],
    ['2026-01-31T15:00:00Z', 28, '2026-02-28'],
    ['2028-01-31T15:00:00Z', 28, '2028-02-28'],
  ])(
    'clamps a payment on %s to anchor day %i, so the 29th to 31st never need special handling',
    (paidAt, anchorDay, nextDue) => {
      const window = recoveryPaymentWindow(at(paidAt), SAO_PAULO);

      expect(window.anchorDay).toBe(anchorDay);
      expect(window.nextDueDate.value).toBe(nextDue);
    },
  );

  it('rolls into the next year', () => {
    const window = recoveryPaymentWindow(at('2026-12-15T15:00:00Z'), SAO_PAULO);

    expect(window.nextDueDate.value).toBe('2027-01-15');
    expect(window.periodEnd).toEqual(endOfLocalDay('2027-01-14'));
  });

  it('computes the day in the given zone: the same instant is a different anchor in another zone', () => {
    const paidAt = at('2026-11-19T02:00:00Z'); // 2026-11-18 23:00 São Paulo, 2026-11-19 11:00 Tokyo
    const tokyo = Timezone.create('Asia/Tokyo');

    expect(recoveryPaymentWindow(paidAt, SAO_PAULO).anchorDay).toBe(18);
    expect(recoveryPaymentWindow(paidAt, tokyo).anchorDay).toBe(19);
  });
});
