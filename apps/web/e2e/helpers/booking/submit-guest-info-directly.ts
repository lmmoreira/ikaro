import type { Page } from '@playwright/test';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://localhost:3002/v1';

// Calls PATCH /bookings/:id/submit-info/guest directly (bypassing the UI) — used to move a
// booking past INFO_REQUESTED as test setup, e.g. to reproduce the "guest opens the link after
// already responding" scenario without driving the whole form through the browser twice.
export async function submitGuestInfoDirectly(
  page: Page,
  bookingId: string,
  token: string,
  response: string,
): Promise<void> {
  const res = await page.request.patch(
    `${BFF_URL}/bookings/${bookingId}/submit-info/guest?token=${token}`,
    { data: { response } },
  );
  if (!res.ok()) {
    throw new Error(`submit-guest-info-directly setup failed: ${res.status()} ${await res.text()}`);
  }
}
