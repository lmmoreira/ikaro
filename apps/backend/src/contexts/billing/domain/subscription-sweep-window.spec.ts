import { Timezone } from '../../../shared/value-objects/timezone.vo';
import { addBusinessDays, graceEndsAt, trialSettlementDeadline } from './subscription-sweep-window';

const SAO_PAULO = Timezone.create('America/Sao_Paulo');
const NEW_YORK = Timezone.create('America/New_York');
const HOUR_MS = 3_600_000;

describe('addBusinessDays', () => {
  // 2026-03-02 is a Monday.
  it.each([
    ['Monday + 3', '2026-03-02', 3, '2026-03-05'],
    ['Thursday + 3 skips the weekend', '2026-03-05', 3, '2026-03-10'],
    ['Friday + 1 is the next Monday', '2026-03-06', 1, '2026-03-09'],
    ['Friday + 3 is the next Wednesday', '2026-03-06', 3, '2026-03-11'],
    ['Saturday + 1 is the next Monday', '2026-03-07', 1, '2026-03-09'],
    ['Sunday + 3 is the next Wednesday', '2026-03-08', 3, '2026-03-11'],
    ['zero days is the same date', '2026-03-06', 0, '2026-03-06'],
  ])('%s', (_name, date, days, expected) => {
    expect(addBusinessDays(date, days)).toBe(expected);
  });
});

describe('trialSettlementDeadline', () => {
  it('is 24 literal hours after the trial ends when the manager has not come back from the payment page', () => {
    const trialEndsAt = new Date('2026-03-24T03:00:00Z');

    const deadline = trialSettlementDeadline(trialEndsAt, SAO_PAULO, false);

    expect(deadline).toEqual(new Date(trialEndsAt.getTime() + 24 * HOUR_MS));
  });

  it('is the start of the local day three business days after the last trial day when the manager returned', () => {
    // The trial closes at the start of Friday 2026-03-06 in São Paulo (UTC-3); +3 business days is Wednesday.
    const trialEndsAt = new Date('2026-03-06T03:00:00Z');

    const deadline = trialSettlementDeadline(trialEndsAt, SAO_PAULO, true);

    expect(deadline).toEqual(new Date('2026-03-11T03:00:00Z'));
  });

  it('counts business days on the local calendar across a DST change', () => {
    // New York: the trial closes at the start of Friday 2026-03-06 (EST, UTC-5); DST starts on
    // Sunday 2026-03-08, so the Wednesday deadline is local midnight in EDT (UTC-4).
    const trialEndsAt = new Date('2026-03-06T05:00:00Z');

    const deadline = trialSettlementDeadline(trialEndsAt, NEW_YORK, true);

    expect(deadline).toEqual(new Date('2026-03-11T04:00:00Z'));
  });

  it('uses the tenant-local day, not the UTC one, when the instant falls on another UTC date', () => {
    // 2026-03-02T02:00:00Z is still Sunday 2026-03-01 23:00 in São Paulo: +3 business days from a
    // Sunday is Wednesday 2026-03-04.
    const trialEndsAt = new Date('2026-03-02T02:00:00Z');

    const deadline = trialSettlementDeadline(trialEndsAt, SAO_PAULO, true);

    expect(deadline).toEqual(new Date('2026-03-04T03:00:00Z'));
  });
});

describe('graceEndsAt', () => {
  const pastDueSince = new Date('2026-03-01T12:00:00Z');

  it('is pastDueSince + 14 days without an operator grace', () => {
    expect(graceEndsAt(pastDueSince, null)).toEqual(new Date('2026-03-15T12:00:00Z'));
  });

  it('is the operator grace when one is set (it replaces the 14 days)', () => {
    const graceUntil = new Date('2026-03-30T12:00:00Z');

    expect(graceEndsAt(pastDueSince, graceUntil)).toEqual(graceUntil);
  });
});
