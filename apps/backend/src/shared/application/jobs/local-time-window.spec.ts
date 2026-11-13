import { isInLocalWindow, localTimeWindow, type LocalTimeWindow } from './local-time-window';

const WINDOW: LocalTimeWindow = { start: '06:00', end: '06:29' };
const SAO_PAULO = 'America/Sao_Paulo';
// 09:15 UTC is 06:15 in São Paulo (UTC-3) and 09:15 in UTC.
const NOW = new Date('2026-10-12T09:15:00.000Z');

describe('isInLocalWindow()', () => {
  it('is inside the window at 06:15 local', () => {
    expect(isInLocalWindow(NOW, SAO_PAULO, WINDOW)).toBe(true);
  });

  it.each([
    ['06:00', '2026-10-12T09:00:00.000Z', true],
    ['06:29', '2026-10-12T09:29:00.000Z', true],
    ['06:30', '2026-10-12T09:30:00.000Z', false],
    ['05:59', '2026-10-12T08:59:00.000Z', false],
  ])('includes the window edges: %s local', (_label, iso, expected) => {
    expect(isInLocalWindow(new Date(iso), SAO_PAULO, WINDOW)).toBe(expected);
  });

  it("uses the tenant's own timezone", () => {
    expect(isInLocalWindow(NOW, 'UTC', WINDOW)).toBe(false);
  });
});

describe('localTimeWindow()', () => {
  it("builds a predicate over the tenant's timezone", () => {
    const isDue = localTimeWindow(WINDOW);

    expect(isDue({ id: 'in', timezone: SAO_PAULO }, NOW)).toBe(true);
    expect(isDue({ id: 'out', timezone: 'UTC' }, NOW)).toBe(false);
  });
});
