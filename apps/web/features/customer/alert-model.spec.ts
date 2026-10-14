import { describe, expect, it } from 'vitest';
import {
  alertCancelPath,
  alertDetailPath,
  alertListPath,
  canCancelAlert,
  splitAlertSections,
} from './alert-model';
import { makeAlert } from './components/my-account/availability-alert.fixture';

describe('alert-model', () => {
  it('builds the three route paths', () => {
    expect(alertListPath('vitta')).toBe('/vitta/my-account/alerts');
    expect(alertDetailPath('vitta', 'abc')).toBe('/vitta/my-account/alerts/abc');
    expect(alertCancelPath('vitta', 'abc')).toBe('/vitta/my-account/alerts/abc/cancel');
  });

  it('splits active alerts from the history, keeps the API order, and drops cancelled ones', () => {
    const sections = splitAlertSections([
      makeAlert({ id: '1', status: 'NOTIFIED' }),
      makeAlert({ id: '2', status: 'ACTIVE' }),
      makeAlert({ id: '3', status: 'CANCELLED' }),
      makeAlert({ id: '4', status: 'EXPIRED' }),
      makeAlert({ id: '5', status: 'ACTIVE' }),
    ]);

    expect(sections.active.map((a) => a.id)).toEqual(['2', '5']);
    expect(sections.history.map((a) => a.id)).toEqual(['1', '4']);
  });

  it('lets only an active alert be cancelled', () => {
    expect(canCancelAlert('ACTIVE')).toBe(true);
    expect(canCancelAlert('NOTIFIED')).toBe(false);
    expect(canCancelAlert('EXPIRED')).toBe(false);
    expect(canCancelAlert('CANCELLED')).toBe(false);
  });
});
