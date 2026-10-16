import type { Page } from '@playwright/test';

// The booking page streams its Suspense content: for a moment after `load`, the hidden streaming
// segment (`<div hidden id="S:n">`) holds a second copy of the wizard beside the visible one, until
// React swaps it in. Playwright's strict mode throws on a locator that matches both, so a test that
// asserts a `step-*` test id right after `goto()` fails whenever it wins that race. Navigate through
// this helper and the page is in its settled, single-copy state before the test looks at it.
export async function gotoBookingPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => document.querySelector('div[hidden][id^="S:"]') === null);
}
