import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  ALERT_SWEEP_WINDOW,
  forEachTenantInWindow,
  isInLocalWindow,
  REMINDER_WINDOW,
} from './tenant-local-window';

const logger = new AppLogger('tenant-local-window.spec');
const options = { logger, label: 'Test job' };
// 09:15 UTC is 06:15 in São Paulo (UTC-3) and 09:15 in UTC.
const NOW = new Date('2026-10-12T09:15:00.000Z');
const SAO_PAULO = 'America/Sao_Paulo';

describe('isInLocalWindow()', () => {
  it('is inside the reminder window at 06:15 local', () => {
    expect(isInLocalWindow(NOW, SAO_PAULO, REMINDER_WINDOW)).toBe(true);
  });

  it.each([
    ['06:00', '2026-10-12T09:00:00.000Z', true],
    ['06:29', '2026-10-12T09:29:00.000Z', true],
    ['06:30', '2026-10-12T09:30:00.000Z', false],
    ['05:59', '2026-10-12T08:59:00.000Z', false],
  ])('the reminder window includes its edges: %s local', (_label, iso, expected) => {
    expect(isInLocalWindow(new Date(iso), SAO_PAULO, REMINDER_WINDOW)).toBe(expected);
  });

  it('keeps the alert sweep window directly after the reminder window, never overlapping it', () => {
    const lastReminderMinute = new Date('2026-10-12T09:29:00.000Z');
    const firstSweepMinute = new Date('2026-10-12T09:30:00.000Z');

    expect(isInLocalWindow(firstSweepMinute, SAO_PAULO, ALERT_SWEEP_WINDOW)).toBe(true);
    expect(isInLocalWindow(lastReminderMinute, SAO_PAULO, ALERT_SWEEP_WINDOW)).toBe(false);
  });

  it("uses the tenant's own timezone", () => {
    expect(isInLocalWindow(NOW, 'UTC', REMINDER_WINDOW)).toBe(false);
  });
});

describe('forEachTenantInWindow()', () => {
  const inWindow = { id: 'tenant-in', timezone: SAO_PAULO };
  const outOfWindow = { id: 'tenant-out', timezone: 'UTC' };

  it('runs the work only for tenants inside their window, in order', async () => {
    const seen: string[] = [];

    await forEachTenantInWindow(
      [outOfWindow, inWindow],
      NOW,
      REMINDER_WINDOW,
      options,
      async (tenant) => {
        seen.push(tenant.id);
      },
    );

    expect(seen).toEqual(['tenant-in']);
  });

  it('tries every tenant after a failure, then fails the run naming each failed tenant', async () => {
    const seen: string[] = [];
    const second = { id: 'tenant-second', timezone: SAO_PAULO };
    const third = { id: 'tenant-third', timezone: SAO_PAULO };

    await expect(
      forEachTenantInWindow(
        [inWindow, second, third],
        NOW,
        REMINDER_WINDOW,
        options,
        async (tenant) => {
          seen.push(tenant.id);
          if (tenant.id !== 'tenant-second') throw new Error(`${tenant.id} broke`);
        },
      ),
    ).rejects.toThrow('Test job failed for tenant(s): tenant-in, tenant-third');

    expect(seen).toEqual(['tenant-in', 'tenant-second', 'tenant-third']);
  });

  it('resolves when no tenant is inside its window', async () => {
    await expect(
      forEachTenantInWindow([outOfWindow], NOW, REMINDER_WINDOW, options, async () => {
        throw new Error('must not run');
      }),
    ).resolves.toBeUndefined();
  });
});
