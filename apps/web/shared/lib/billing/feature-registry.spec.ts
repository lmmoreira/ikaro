import { readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ALL_FEATURES,
  ROUTE_FEATURES,
  UNGATED_ROUTES,
  featureForPath,
  isFeatureLocked,
  isRouteLocked,
} from './feature-registry';

const DASHBOARD_APP_DIR = path.resolve(__dirname, '../../../app/dashboard');

function listDashboardPageRoutes(dir: string, route: string): string[] {
  const routes: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      routes.push(...listDashboardPageRoutes(path.join(dir, entry.name), `${route}/${entry.name}`));
    } else if (entry.name === 'page.tsx') {
      routes.push(route);
    }
  }
  return routes;
}

describe('feature registry', () => {
  it('maps every dashboard page.tsx to a feature or deliberately leaves it ungated', () => {
    const pages = listDashboardPageRoutes(DASHBOARD_APP_DIR, '/dashboard');

    expect(pages.length).toBeGreaterThan(20);
    const unmapped = pages.filter(
      (route) => featureForPath(route) === null && !UNGATED_ROUTES.includes(route),
    );
    expect(unmapped).toEqual([]);
  });

  it('lists a feature for every route prefix it declares', () => {
    for (const [, feature] of ROUTE_FEATURES) {
      expect(ALL_FEATURES).toContain(feature);
    }
  });

  it('knows every feature key', () => {
    expect([...ALL_FEATURES].sort()).toEqual(
      ['BOOKING', 'CHATBOT', 'HOTSITE', 'LEAD_FORM', 'LOYALTY'].sort(),
    );
  });

  it.each([
    ['/dashboard/bookings', 'BOOKING'],
    ['/dashboard/bookings/recurring/new', 'BOOKING'],
    ['/dashboard/scheduling-exceptions/abc/reschedule', 'BOOKING'],
    ['/dashboard/loyalty/123', 'LOYALTY'],
    ['/dashboard/leads', 'LEAD_FORM'],
    ['/dashboard/settings', 'HOTSITE'],
  ])('resolves %s to %s', (pathname, feature) => {
    expect(featureForPath(pathname)).toBe(feature);
  });

  it('matches whole path segments only', () => {
    expect(featureForPath('/dashboard/teamwork')).toBeNull();
    expect(featureForPath('/dashboard/loyaltyx')).toBeNull();
  });

  it('gives no feature to the ungated routes', () => {
    for (const route of UNGATED_ROUTES) {
      expect(featureForPath(route)).toBeNull();
    }
  });

  it('reports a route locked only when its feature is locked', () => {
    expect(isRouteLocked('/dashboard/loyalty', ['LOYALTY'])).toBe(true);
    expect(isRouteLocked('/dashboard/loyalty', ['LEAD_FORM'])).toBe(false);
    expect(isRouteLocked('/dashboard/loyalty', [])).toBe(false);
    expect(isRouteLocked('/dashboard/suspended', ['LOYALTY'])).toBe(false);
  });

  it('reports a feature locked only when it is in the locked list', () => {
    expect(isFeatureLocked('LOYALTY', ['LOYALTY'])).toBe(true);
    expect(isFeatureLocked('LOYALTY', ['CHATBOT'])).toBe(false);
    expect(isFeatureLocked(null, ['LOYALTY'])).toBe(false);
  });
});
