import { effectiveExpiry, ExpiryPause } from './effective-expiry';

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date('2026-01-01T00:00:00.000Z');
const at = (days: number): Date => new Date(T0.getTime() + days * DAY);
const entry = { earnedAt: T0, expiresAt: at(30) };
const closed = (from: number, to: number): ExpiryPause => ({
  pausedAt: at(from),
  resumedAt: at(to),
});
const open = (from: number): ExpiryPause => ({ pausedAt: at(from), resumedAt: null });

describe('effectiveExpiry', () => {
  it('returns the raw expiry when the tenant has no pause', () => {
    expect(effectiveExpiry(entry, [])).toEqual(at(30));
  });

  it('shifts the expiry by exactly the length of a closed pause inside the lifetime', () => {
    expect(effectiveExpiry(entry, [closed(10, 15)])).toEqual(at(35));
  });

  it('counts a second pause that falls inside the first pause extension', () => {
    // Raw expiry day 30, first pause 10-15 moves it to 35, second pause 32-34 moves it to 37.
    expect(effectiveExpiry(entry, [closed(10, 15), closed(32, 34)])).toEqual(at(37));
  });

  it('is independent of the order the pauses are passed in', () => {
    expect(effectiveExpiry(entry, [closed(32, 34), closed(10, 15)])).toEqual(at(37));
  });

  it('returns null while an open pause is reached inside the lifetime', () => {
    expect(effectiveExpiry(entry, [open(20)])).toBeNull();
  });

  it('returns null when an open pause starts inside the extension of a closed one', () => {
    expect(effectiveExpiry(entry, [closed(10, 15), open(33)])).toBeNull();
  });

  it('does not rescue an entry already due when the pause starts after its raw expiry', () => {
    expect(effectiveExpiry(entry, [closed(31, 40)])).toEqual(at(30));
    expect(effectiveExpiry(entry, [open(31)])).toEqual(at(30));
  });

  it('does not rescue an entry when the pause starts exactly at its raw expiry', () => {
    expect(effectiveExpiry(entry, [open(30)])).toEqual(at(30));
  });

  it('ignores a pause that ended before the entry was earned', () => {
    expect(effectiveExpiry({ earnedAt: at(20), expiresAt: at(50) }, [closed(10, 15)])).toEqual(
      at(50),
    );
  });

  it('restarts the clock at the end of a pause that was already running when the entry was earned', () => {
    expect(effectiveExpiry({ earnedAt: at(12), expiresAt: at(42) }, [closed(10, 15)])).toEqual(
      at(45),
    );
  });

  it('holds an entry earned inside a pause that is still open', () => {
    expect(effectiveExpiry({ earnedAt: at(12), expiresAt: at(42) }, [open(10)])).toBeNull();
  });

  it('does not mutate the pauses it was given', () => {
    const pauses = [closed(32, 34), closed(10, 15)];
    effectiveExpiry(entry, pauses);
    expect(pauses[0].pausedAt).toEqual(at(32));
  });
});
