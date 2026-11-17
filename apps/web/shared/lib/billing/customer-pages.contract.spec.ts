import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { CustomerFeatureKey } from '@ikaro/types';

// The customer account's pages, each with the feature that owns it (`null`: no feature of its own).
// The rule (docs/ENGINEERING_RULES_SHARED.md § Tenant access enforcement): a page a customer-facing
// feature owns calls `redirectCustomerWithoutFeature(token, slug, '<FEATURE>')`, or
// `redirectCustomerWhenBookingUnavailable` for the two BOOKING pages that a suspended tenant refuses,
// FIRST, before any read, so a tenant without the feature sends its customer back to Início instead
// of an error page. The table lives here, not in product code: nothing would read it at runtime.
// A new page must be added to it, and a page that forgets its guard fails.
const CUSTOMER_PAGE_FEATURE: Readonly<Record<string, CustomerFeatureKey | null>> = {
  '': null, // Início: always there, it hides the surfaces of the features the tenant lacks
  alerts: 'BOOKING',
  'alerts/[id]': 'BOOKING',
  'alerts/[id]/cancel': 'BOOKING',
  bookings: 'BOOKING',
  'bookings/[id]': 'BOOKING',
  'bookings/[id]/cancel': 'BOOKING',
  'bookings/[id]/cancel/error': 'BOOKING',
  'bookings/[id]/reschedule': 'BOOKING',
  loyalty: 'LOYALTY',
  'recurring-schedules': 'BOOKING',
  'recurring-schedules/[id]': 'BOOKING',
  'recurring-schedules/[id]/end': 'BOOKING',
  'recurring-schedules/new': 'BOOKING',
};

const MY_ACCOUNT_DIR = path.resolve(__dirname, '../../../app/[slug]/my-account');

function listPages(dir: string, route: string): string[] {
  const pages: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      pages.push(
        ...listPages(path.join(dir, entry.name), route ? `${route}/${entry.name}` : entry.name),
      );
    } else if (entry.name === 'page.tsx') {
      pages.push(route);
    }
  }
  return pages;
}

function sourceOf(route: string): string {
  return readFileSync(path.join(MY_ACCOUNT_DIR, route, 'page.tsx'), 'utf8');
}

// The statement that guards the page: the helper call for the feature, up to its semicolon. A
// mention in an import or a comment is not a call, so the opening parenthesis is required.
function guardIndex(source: string, feature: CustomerFeatureKey): number {
  const direct = new RegExp(`redirectCustomerWithoutFeature\\([^;]*'${feature}'`).exec(source);
  const booking =
    feature === 'BOOKING' ? /redirectCustomerWhenBookingUnavailable\(/.exec(source) : null;
  const indexes = [direct?.index, booking?.index].filter((index) => index !== undefined);
  return indexes.length === 0 ? -1 : Math.min(...indexes);
}

// The first read the page makes: a `fetchXxx(` call or a `withAuthRedirect(` wrapper.
function firstReadIndex(source: string): number {
  return source.search(/\b(?:fetch[A-Z]\w*|withAuthRedirect)\(/);
}

describe('the customer account pages', () => {
  const pages = listPages(MY_ACCOUNT_DIR, '');

  it('finds the pages it is meant to check', () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it('lists every page.tsx of the account in the table, and no page that does not exist', () => {
    expect([...pages].sort()).toEqual(Object.keys(CUSTOMER_PAGE_FEATURE).sort());
  });

  const gated = Object.entries(CUSTOMER_PAGE_FEATURE).filter(
    (entry): entry is [string, CustomerFeatureKey] => entry[1] !== null,
  );

  it.each(gated)('/my-account/%s calls the guard of %s', (route, feature) => {
    expect(guardIndex(sourceOf(route), feature)).toBeGreaterThanOrEqual(0);
  });

  it.each(gated)('/my-account/%s guards before it makes any read', (route) => {
    const source = sourceOf(route);
    const feature = CUSTOMER_PAGE_FEATURE[route] as CustomerFeatureKey;
    const read = firstReadIndex(source);

    // A page whose only reads sit behind the guard has none before it.
    expect(read === -1 || guardIndex(source, feature) < read).toBe(true);
  });
});
