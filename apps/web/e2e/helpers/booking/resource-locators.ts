import type { Locator, Page } from '@playwright/test';

// Mirrors staff/team-locators.ts's getMemberRow — ResourceListPage's rows share the same
// `.divide-y > div` list-row shape.
export function getResourceRow(page: Page, text: string): Locator {
  return page.locator('.divide-y > div').filter({ hasText: text });
}
