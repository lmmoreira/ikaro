import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { FeatureKey } from '@ikaro/types';
import { HOTSITE_PAGE_FEATURE } from '../../../features/platform/hotsite/feature-availability';
import { ROUTE_FEATURES } from '../../../shared/lib/billing/feature-registry';

// The pages each shell offers and the feature that owns each, read from the product's own registries
// and sources, so a page or a route added later is picked up by the plan-profile matrix without a
// hand-kept list here (docs/ENGINEERING_RULES_SHARED.md § Tenant access enforcement).

// A random id for the pages that take one: the guards redirect before any read, and a page that
// holds its feature answers 404 for an id that does not exist.
export const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000aa';

const MY_ACCOUNT_DIR = path.resolve(__dirname, '../../../app/[slug]/my-account');

export interface FeaturePage {
  // The path under the tenant (hotsite: `/{slug}/…`; account: `/{slug}/my-account/…`), dynamic
  // segments already replaced.
  readonly path: string;
  readonly feature: FeatureKey | null;
  // The page takes an id, so a tenant that holds its feature answers 404 for an unknown one.
  readonly takesId: boolean;
}

function substitute(route: string): { path: string; takesId: boolean } {
  const takesId = /\[[^\]]+\]/.test(route);
  return { path: route.replace(/\[[^\]]+\]/g, UNKNOWN_ID), takesId };
}

// The public hotsite pages a feature owns (`/booking`, `/booking/availability-alert`, a service
// page).
export function hotsitePages(slug: string): FeaturePage[] {
  return Object.entries(HOTSITE_PAGE_FEATURE).map(([route, feature]) => {
    const { path: routePath, takesId } = substitute(route);
    return { path: `/${slug}/${routePath}`, feature, takesId };
  });
}

function listAccountPages(dir: string, route: string): string[] {
  const pages: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      pages.push(
        ...listAccountPages(
          path.join(dir, entry.name),
          route ? `${route}/${entry.name}` : entry.name,
        ),
      );
    } else if (entry.name === 'page.tsx') {
      pages.push(route);
    }
  }
  return pages;
}

// The feature a customer page guards itself with: the helper call in its own source, the same one
// the contract spec checks (`customer-pages.contract.spec.ts`).
function accountPageFeature(route: string): FeatureKey | null {
  const source = readFileSync(path.join(MY_ACCOUNT_DIR, route, 'page.tsx'), 'utf8');
  const direct = /redirectCustomerWithoutFeature\([^;]*'([A-Z_]+)'/.exec(source);
  if (direct) return direct[1] as FeatureKey;
  return /redirectCustomerWhenBookingUnavailable\(/.test(source) ? 'BOOKING' : null;
}

export function accountPages(slug: string): FeaturePage[] {
  return listAccountPages(MY_ACCOUNT_DIR, '').map((route) => {
    const { path: routePath, takesId } = substitute(route);
    return {
      path: routePath === '' ? `/${slug}/my-account` : `/${slug}/my-account/${routePath}`,
      feature: accountPageFeature(route),
      takesId,
    };
  });
}

// The dashboard routes and the feature each belongs to (one entry per route prefix).
export function dashboardRoutes(): { path: string; feature: FeatureKey }[] {
  return ROUTE_FEATURES.map(([prefix, feature]) => ({ path: prefix, feature }));
}
