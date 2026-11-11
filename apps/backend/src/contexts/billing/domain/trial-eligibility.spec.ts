import {
  evaluateTrialEligibility,
  type GoogleSubHistoryEntry,
  isGoogleSubEligible,
} from './trial-eligibility';

const paid: GoogleSubHistoryEntry = { status: 'COMPLETED', hasEverPaid: true };
const unpaid: GoogleSubHistoryEntry = { status: 'COMPLETED', hasEverPaid: false };
const inFlight: GoogleSubHistoryEntry = { status: 'RESERVED', hasEverPaid: false };

describe('isGoogleSubEligible', () => {
  it.each<[string, GoogleSubHistoryEntry[], boolean]>([
    ['no history', [], true],
    ['only paid tenants', [paid, paid], true],
    ['one unpaid tenant', [unpaid], false],
    ['a mixed history (one paid, one unpaid)', [paid, unpaid], false],
    ['an in-flight RESERVED row', [inFlight], false],
    ['an in-flight RESERVED row next to a paid tenant', [paid, inFlight], false],
    ['a COMPLETED row whose subscription does not exist yet (hasEverPaid false)', [unpaid], false],
  ])('%s', (_name, history, expected) => {
    expect(isGoogleSubEligible(history)).toBe(expected);
  });

  it('a RESERVED row never counts as paid even if hasEverPaid were true', () => {
    expect(isGoogleSubEligible([{ status: 'RESERVED', hasEverPaid: true }])).toBe(false);
  });
});

describe('evaluateTrialEligibility', () => {
  it('is eligible when the Google half passes and the tax id is free', () => {
    expect(evaluateTrialEligibility({ history: [paid], taxIdHeldByUnpaid: false })).toBe(true);
  });

  it('is ineligible when the tax id is held by a never-paid account, even for a clean Google account', () => {
    expect(evaluateTrialEligibility({ history: [], taxIdHeldByUnpaid: true })).toBe(false);
  });

  it('is ineligible when the Google half fails, whatever the tax id says', () => {
    expect(evaluateTrialEligibility({ history: [unpaid], taxIdHeldByUnpaid: false })).toBe(false);
  });
});
