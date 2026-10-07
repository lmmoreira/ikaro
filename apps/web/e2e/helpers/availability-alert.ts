import { expect, type Browser, type Page } from '@playwright/test';
import type { AvailabilityAlertListResponse, AvailabilityAlertResponse } from '@ikaro/types';
import { loginAsCustomer, uniqueTestEmail } from './auth';
import { completeCustomerProfile } from './customer';
import { nextButton, openBooking, selectService, TENANT_SLUG } from './booking-form';
import { seedFixedService, type SeededService } from './booking-form/seeds';
import { setBookingPolicy } from './services';

const WEB_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// M23-S31 — UC-072. A fixed-duration service that permits availability alerts (the policy flag is
// off by default), seeded by a signed-in manager `page`.
export async function seedAlertEligibleService(page: Page): Promise<SeededService> {
  const service = await seedFixedService(page, 'e2e-aviso');
  await setBookingPolicy(page, service.serviceId, { availabilityAlertEligible: true });
  return service;
}

// A page in its own browser context, so the manager cookie used for seeding never leaks into the
// customer or guest under test.
export async function newContextPage(
  browser: Browser,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL: WEB_URL });
  return { page: await context.newPage(), close: () => context.close() };
}

// A logged-in customer with a complete profile — an incomplete one gets the blocking
// InformationCompletionPrompt over every hotsite page, the alert page included.
export async function newLoggedInCustomerPage(
  browser: Browser,
): Promise<{ page: Page; email: string; close: () => Promise<void> }> {
  const { page, close } = await newContextPage(browser);
  const email = uniqueTestEmail('e2e-alert');
  await loginAsCustomer(page, email, TENANT_SLUG);
  await completeCustomerProfile(page, TENANT_SLUG);
  return { page, email, close };
}

// Walks the booking flow of a one-service basket up to its calendar step.
export async function openCalendarStep(page: Page, serviceId: string): Promise<void> {
  await openBooking(page);
  await selectService(page, serviceId);
  await nextButton(page).click();
  await expect(page.locator('[data-testid="day-option"]').first()).toBeVisible({
    timeout: 20_000,
  });
}

// "YYYY-MM-DDTHH:mm" for an <input type="datetime-local">, `daysAhead` days from now on the
// TENANT's calendar (docs/ENGINEERING_RULES_TESTING.md § An E2E test that computes "today") — the
// runner's own clock and zone diverge from it for hours every day. A couple of days of margin keeps
// "ends in the future" true across that gap.
const TENANT_TIMEZONE = 'America/Sao_Paulo';

export function futureWallTime(daysAhead: number, time: string): string {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: TENANT_TIMEZONE }).format(
    new Date(Date.now() + daysAhead * 86_400_000),
  );
  return `${day}T${time}`;
}

// The signed-in customer's own alerts, read through the same-origin /v1 gateway.
export async function listMyAlerts(page: Page): Promise<AvailabilityAlertResponse[]> {
  const res = await page.request.get(`${WEB_URL}/v1/availability-alerts`);
  expect(res.ok(), `list alerts: ${res.status()}`).toBe(true);
  return ((await res.json()) as AvailabilityAlertListResponse).items;
}

// One ONE_TIME_RANGE alert created straight through the API — used to fill the per-customer cap
// of 10 without driving the form ten times.
export async function createAlertViaApi(
  page: Page,
  serviceId: string,
  index: number,
): Promise<void> {
  const start = new Date(Date.now() + (3 + index) * 86_400_000);
  const end = new Date(start.getTime() + 3_600_000);
  const res = await page.request.post(`${WEB_URL}/v1/availability-alerts`, {
    data: {
      serviceId,
      criteriaType: 'ONE_TIME_RANGE',
      acceptableStartAt: start.toISOString(),
      acceptableEndAt: end.toISOString(),
    },
  });
  expect(res.status(), `create alert ${index}: ${await res.text()}`).toBe(201);
}
