import type { Page } from '@playwright/test';

// Makes every save of the hotsite draft (PATCH /v1/tenants/hotsite) fail with a 500, so a spec can
// assert how the editor reports a refused publish. Other methods on the same path pass through.
export async function failHotsitePublish(page: Page): Promise<void> {
  await page.route('**/v1/tenants/hotsite', (route) =>
    route.request().method() === 'PATCH'
      ? route.fulfill({
          status: 500,
          contentType: 'application/problem+json',
          body: JSON.stringify({ status: 500, title: 'Internal Server Error' }),
        })
      : route.fallback(),
  );
}
