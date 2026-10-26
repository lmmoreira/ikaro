import { nextOpenInstant, openDate, openSlot, openSlotAt } from './date-helpers';

describe('openDate / openSlot', () => {
  afterEach(() => jest.useRealTimers());

  it.each([
    ['a Saturday', '2031-03-01T12:00:00.000Z', 1, '2031-03-03'],
    ['a Sunday', '2031-03-02T12:00:00.000Z', 1, '2031-03-03'],
    ['a Friday', '2031-02-28T12:00:00.000Z', 1, '2031-03-01'],
  ])('skips Sunday when today is %s', (_label, now, nth, expected) => {
    jest.useFakeTimers().setSystemTime(new Date(now));
    expect(openDate(nth)).toBe(expected);
  });

  it('returns a different date for every n, never a Sunday', () => {
    jest.useFakeTimers().setSystemTime(new Date('2031-03-01T12:00:00.000Z'));
    const dates = Array.from({ length: 30 }, (_, i) => openDate(i + 1));
    expect(new Set(dates).size).toBe(30);
    expect(dates.every((d) => new Date(`${d}T12:00:00Z`).getUTCDay() !== 0)).toBe(true);
  });

  it('openSlot is 10:00 America/Sao_Paulo on that date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2031-03-01T12:00:00.000Z'));
    expect(openSlot(1)).toBe('2031-03-03T13:00:00.000Z');
  });

  it('openSlotAt takes the tenant-local hour', () => {
    jest.useFakeTimers().setSystemTime(new Date('2031-03-01T12:00:00.000Z'));
    expect(openSlotAt(1, 9)).toBe('2031-03-03T12:00:00.000Z');
    expect(openSlotAt(2, 15)).toBe('2031-03-04T18:00:00.000Z');
  });

  describe('nextOpenInstant', () => {
    it.each([
      ['inside the hours', '2031-03-04T15:10:00.000Z', '2031-03-04T16:00:00.000Z'],
      ['after closing', '2031-03-04T21:30:00.000Z', '2031-03-05T12:00:00.000Z'],
      ['too late for a 90-minute window', '2031-03-04T19:30:00.000Z', '2031-03-05T12:00:00.000Z'],
      ['on a Sunday', '2031-03-02T15:00:00.000Z', '2031-03-03T12:00:00.000Z'],
      ['on Saturday evening', '2031-03-01T21:00:00.000Z', '2031-03-03T12:00:00.000Z'],
    ])('returns the first bookable half hour when now is %s', (_label, now, expected) => {
      jest.useFakeTimers().setSystemTime(new Date(now));
      expect(nextOpenInstant()).toBe(expected);
    });

    it('skips whole slots and never starts a booking that would end after closing', () => {
      jest.useFakeTimers().setSystemTime(new Date('2031-03-04T18:00:00.000Z'));
      // 16:30 local is the last start whose 90 minutes end by the 18:00 close; then Wednesday 09:00.
      expect(nextOpenInstant(0)).toBe('2031-03-04T18:30:00.000Z');
      expect(nextOpenInstant(2)).toBe('2031-03-04T19:30:00.000Z');
      expect(nextOpenInstant(3)).toBe('2031-03-05T12:00:00.000Z');
    });
  });
});
