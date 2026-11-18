import { expect, type Locator, type Page } from '@playwright/test';
import { REINSTATEMENT_BOUND_MS } from './suspension';

// Browser mechanics the customer-account scenarios share: where the account lives, a marker that
// proves a navigation stayed on the client, and the responsive controls (a topbar control and its
// phone-width twin). The scenarios' own assertions stay in the specs.

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 800 };

export const accountPath = (slug: string): string => `/${slug}/my-account`;

type ClientSessionWindow = Window & { __e2eClientSession?: string };

// A navigation that stays inside the Next.js client runtime keeps this marker; a full page load
// drops it. The mid-session scenarios prove the page took the tenant state on arrival, not only
// from the account layout, which survives client navigation.
export async function markClientSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as ClientSessionWindow).__e2eClientSession = 'kept';
  });
}

export async function expectClientSessionKept(page: Page): Promise<void> {
  expect(await page.evaluate(() => (window as ClientSessionWindow).__e2eClientSession)).toBe(
    'kept',
  );
}

// A control rendered once for the topbar and once for the page body: the first match may be the
// hidden variant, so the locator keeps only what the viewport shows.
export function visibleByTestId(page: Page, testId: string): Locator {
  return page.locator(`[data-testid="${testId}"]:visible`).first();
}

// The "+ Novo" a page draws itself (a phone-width control; on a desktop the topbar owns it, and the
// topbar belongs to the layout that client navigation keeps). The mid-session scenarios assert the
// page's own control, which must follow the tenant state the page took on arrival.
export async function expectPageNewMenu(page: Page, state: 'disabled' | 'enabled'): Promise<void> {
  const original = page.viewportSize();
  await page.setViewportSize(PHONE);
  const testId = state === 'disabled' ? 'new-booking-disabled' : 'new-menu-trigger';
  await expect(
    page.locator(`[data-testid="mobile-new-menu"] [data-testid="${testId}"]`),
  ).toBeVisible({ timeout: REINSTATEMENT_BOUND_MS });
  await page.setViewportSize(original ?? DESKTOP);
}

// The tab nav shows on desktop; the bottom nav on a phone. Both must carry the tab.
export async function expectTabInBothNavs(page: Page, href: string): Promise<void> {
  const original = page.viewportSize();
  await page.setViewportSize(DESKTOP);
  await expect(page.locator(`a[href="${href}"]:visible`).first()).toBeVisible();
  await page.setViewportSize(PHONE);
  await expect(page.locator(`a[href="${href}"]:visible`).first()).toBeVisible();
  await page.setViewportSize(original ?? DESKTOP);
}
