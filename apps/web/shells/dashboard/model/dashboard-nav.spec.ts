import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FeatureKey } from '@ikaro/types';
import { ALL_FEATURES, featureForPath } from '@/shared/lib/billing/feature-registry';
import {
  DASHBOARD_NAV,
  resolveDashboardNav,
  type DashboardNav,
  type DashboardNavRole,
} from './dashboard-nav';

const DASHBOARD_APP_DIR = path.resolve(__dirname, '../../../app/dashboard');
const ROLES: readonly DashboardNavRole[] = ['STAFF', 'MANAGER'];
const LOCK_SETS: readonly (readonly FeatureKey[])[] = [[], ...ALL_FEATURES.map((f) => [f])];

function resolve(
  role: DashboardNavRole,
  leadFormEnabled = false,
  lockedFeatures: readonly FeatureKey[] = [],
): DashboardNav {
  return resolveDashboardNav({ role, lockedFeatures, toggles: { leadForm: leadFormEnabled } });
}

const hrefs = (items: readonly { href: string }[]) => items.map(({ href }) => href);

describe('the dashboard navigation registry', () => {
  it('points every item at a real dashboard page', () => {
    for (const { href } of DASHBOARD_NAV) {
      const page = path.join(DASHBOARD_APP_DIR, href.replace('/dashboard/', ''), 'page.tsx');

      expect(existsSync(page), `${href} has no page.tsx`).toBe(true);
    }
  });

  it('lists each item once', () => {
    expect(new Set(hrefs(DASHBOARD_NAV)).size).toBe(DASHBOARD_NAV.length);
  });

  it('draws every item on at least one surface and for at least one role', () => {
    for (const { href, surfaces, roles } of DASHBOARD_NAV) {
      expect(Object.values(surfaces).some(Boolean), `${href} appears nowhere`).toBe(true);
      expect(roles.length, `${href} is for no role`).toBeGreaterThan(0);
    }
  });
});

describe('resolveDashboardNav: locking comes from the route registry, never from the item', () => {
  // Looped over every feature the registry knows: an item is locked exactly when the feature its
  // route belongs to is locked, so a new feature or item is covered without a new case.
  it.each(ALL_FEATURES)(
    'locks exactly the items whose route needs %s when it is locked',
    (feature) => {
      const nav = resolve('MANAGER', true, [feature]);
      const items = [...nav.sidebarMain, ...nav.sidebarManager, ...nav.bottomTabs];

      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.locked, item.href).toBe(featureForPath(item.href) === feature);
      }
    },
  );

  it('locks nothing for a tenant that holds every feature', () => {
    const nav = resolve('MANAGER', true);

    expect([...nav.sidebarMain, ...nav.sidebarManager].some((item) => item.locked)).toBe(false);
  });
});

describe('resolveDashboardNav: where each item appears', () => {
  it('keeps the four core items in the sidebar and the bottom bar, in order, for both roles', () => {
    const core = [
      '/dashboard/bookings',
      '/dashboard/schedule',
      '/dashboard/services',
      '/dashboard/loyalty',
    ];

    for (const role of ROLES) {
      const nav = resolve(role, true);

      expect(hrefs(nav.bottomTabs)).toEqual(core);
      expect(hrefs(nav.sidebarMain)).toEqual([...core, '/dashboard/leads']);
    }
  });

  // Negative guarantees: these hold by construction, so each is pinned.
  it('never puts Leads or a manager item in the bottom bar', () => {
    for (const role of ROLES) {
      for (const locked of LOCK_SETS) {
        const nav = resolve(role, true, locked);

        expect(hrefs(nav.bottomTabs)).not.toContain('/dashboard/leads');
        expect(nav.bottomTabs.every((item) => item.group === 'main')).toBe(true);
      }
    }
  });

  it('shows the manager items to a manager only, in the sidebar and in the sheet', () => {
    const manager = [
      '/dashboard/resources',
      '/dashboard/team',
      '/dashboard/settings',
      '/dashboard/hotsite',
    ];
    const asManager = resolve('MANAGER');
    const asStaff = resolve('STAFF', true);

    expect(hrefs(asManager.sidebarManager)).toEqual(manager);
    expect(hrefs(asManager.sheetManager)).toEqual(manager);
    expect(asStaff.sidebarManager).toEqual([]);
    expect(asStaff.sheetManager).toEqual([]);
  });

  it('puts Leads in the sidebar and in the sheet, for either role, never in the manager section', () => {
    for (const role of ROLES) {
      const nav = resolve(role, true);

      expect(hrefs(nav.sheetMain)).toEqual(['/dashboard/leads']);
      expect(hrefs(nav.sidebarManager)).not.toContain('/dashboard/leads');
      expect(hrefs(nav.sheetManager)).not.toContain('/dashboard/leads');
    }
  });

  it('keeps the test ids the E2E specs click', () => {
    const nav = resolve('MANAGER', true);
    const ids = Object.fromEntries(
      [...nav.sidebarMain, ...nav.sidebarManager].map((item) => [item.href, item.testId]),
    );

    expect(ids['/dashboard/leads']).toBe('sidebar-nav-leads');
    expect(ids['/dashboard/resources']).toBe('sidebar-nav-resources');
  });
});

describe('resolveDashboardNav: Leads has three states', () => {
  const leads = (nav: DashboardNav) => nav.sidebarMain.find((i) => i.href === '/dashboard/leads');

  it.each(ROLES)('is shown when the lead form is entitled and switched on (%s)', (role) => {
    expect(leads(resolve(role, true))).toMatchObject({ locked: false });
  });

  it.each(ROLES)('is hidden when the lead form is entitled and switched off (%s)', (role) => {
    expect(leads(resolve(role, false))).toBeUndefined();
    expect(resolve(role, false).sheetMain).toEqual([]);
  });

  it.each(ROLES)(
    'is shown locked when the tenant is not entitled, whatever the switch says (%s)',
    (role) => {
      for (const switchedOn of [true, false]) {
        const nav = resolve(role, switchedOn, ['LEAD_FORM']);

        expect(leads(nav)).toMatchObject({ locked: true });
        expect(nav.sheetMain).toHaveLength(1);
      }
    },
  );
});

describe('resolveDashboardNav: the "Mais" sheet', () => {
  it('exists for a manager whatever happens to the toggled modules', () => {
    for (const locked of LOCK_SETS) {
      expect(resolve('MANAGER', false, locked).hasSheet).toBe(true);
      expect(resolve('MANAGER', true, locked).hasSheet).toBe(true);
    }
  });

  it('exists for staff only while Leads is shown or locked', () => {
    expect(resolve('STAFF', false).hasSheet).toBe(false);
    expect(resolve('STAFF', true).hasSheet).toBe(true);
    expect(resolve('STAFF', false, ['LEAD_FORM']).hasSheet).toBe(true);
    expect(resolve('STAFF', false, ['BOOKING']).hasSheet).toBe(false);
  });
});
