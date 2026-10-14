import { describe, expect, it } from 'vitest';
import type { AvailabilityAlertResponse } from '@ikaro/types';
import { isVisibleAlert, withEffectiveStatus } from './availability-alert-status';

const NOW = new Date('2026-10-14T12:00:00.000Z');

function alertOf(status: string, expiresAt: string): AvailabilityAlertResponse {
  return { id: 'a1', status, expiresAt } as AvailabilityAlertResponse;
}

describe('isVisibleAlert', () => {
  it('hides only a cancelled alert', () => {
    expect(isVisibleAlert({ status: 'CANCELLED' })).toBe(false);
    expect(isVisibleAlert({ status: 'ACTIVE' })).toBe(true);
    expect(isVisibleAlert({ status: 'NOTIFIED' })).toBe(true);
    expect(isVisibleAlert({ status: 'EXPIRED' })).toBe(true);
  });
});

describe('withEffectiveStatus', () => {
  it('keeps an ACTIVE alert that has not reached its expiry', () => {
    const alert = alertOf('ACTIVE', '2026-10-15T00:00:00.000Z');

    expect(withEffectiveStatus(alert, NOW)).toBe(alert);
  });

  it('reads an ACTIVE alert past its expiry as EXPIRED (the sweep has not run yet)', () => {
    const alert = alertOf('ACTIVE', '2026-10-13T00:00:00.000Z');

    expect(withEffectiveStatus(alert, NOW).status).toBe('EXPIRED');
  });

  it('treats the exact expiry instant as expired, like the backend', () => {
    const alert = alertOf('ACTIVE', NOW.toISOString());

    expect(withEffectiveStatus(alert, NOW).status).toBe('EXPIRED');
  });

  it.each(['NOTIFIED', 'EXPIRED', 'CANCELLED'])('never changes a %s alert', (status) => {
    const alert = alertOf(status, '2020-01-01T00:00:00.000Z');

    expect(withEffectiveStatus(alert, NOW)).toBe(alert);
  });
});
