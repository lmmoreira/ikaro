import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { loginAsCustomer, uniqueTestEmail } from './auth';
import { newLoggedInCustomerPage } from './availability-alert';
import { openNewBookingMenu, chooseRegisteredCustomer } from './booking/staff-new-booking';
import { TENANT_SLUG } from './booking-form';
import {
  desktopPane,
  endScheduleViaApi,
  fillRecurringForm,
  listMySchedules,
  type FormPattern,
} from './recurring-schedule';

// M23-S19 — UC-070: staff create a recurring reservation on a customer's behalf, driven through the
// real UI ("+ Novo → Recorrência", the shared customer chooser, the pattern page). The pattern
// fields are the same shared form the customer uses, so `fillRecurringForm` fills them.

export const STAFF_PATTERN_PATH = '/dashboard/bookings/recurring/new';

export type StaffScheduleOutcome =
  'ACTIVE' | 'CONFLICT' | 'CAP_REACHED' | 'PHONE_NOT_SET' | 'CUSTOMER_NOT_FOUND' | 'FAILURE';

/** The result panel of one kind: a single static test id, the kind rides in `data-outcome`. */
export function outcome(page: Page, kind: StaffScheduleOutcome): Locator {
  return page.locator(`[data-testid="staff-schedule-outcome"][data-outcome="${kind}"]`);
}

/** "+ Novo → Recorrência": lands on the shared customer chooser for a recurrence. */
export async function startRecurrenceFromMenu(page: Page): Promise<void> {
  await openNewBookingMenu(page);
  await page.locator('[data-testid="new-menu-item"][data-item="recorrencia"]').click();
  await expect(page).toHaveURL(/\/dashboard\/bookings\/new\?tipo=recorrencia$/);
  await expect(page.getByTestId('customer-chooser')).toBeVisible();
}

/** Picks the customer by their (unique) e-mail and continues to the pattern page. */
export async function chooseCustomerForRecurrence(page: Page, email: string): Promise<void> {
  await chooseRegisteredCustomer(page, email);
  await expect(page).toHaveURL(new RegExp(`${STAFF_PATTERN_PATH}\\?customerId=`));
  await expect(page.getByTestId('new-schedule-staff-form')).toBeVisible();
}

export async function fillStaffPattern(page: Page, pattern: FormPattern): Promise<void> {
  await fillRecurringForm(page, pattern);
}

/** Creates directly: the staff form has no review step. */
export async function submitStaffForm(page: Page): Promise<void> {
  await desktopPane(page).getByTestId('new-schedule-create').click();
}

// Half-hour-aligned hours tried in turn, like the customer helper: the tenant's working hours and
// the slots other workers' schedules already hold answer 409, and the conflict panel offers the way
// back with the pattern kept.
const STAFF_START_TIMES: readonly string[] = ['11:00', '14:00', '09:00', '16:00', '10:00', '15:00'];

/** Creates through the form, trying start times until the backend accepts one. */
export async function createStaffThroughForm(
  page: Page,
  pattern: Omit<FormPattern, 'startTime'>,
): Promise<FormPattern> {
  const failures: string[] = [];
  for (const startTime of STAFF_START_TIMES) {
    const attempt = { ...pattern, startTime };
    await fillStaffPattern(page, attempt);
    await submitStaffForm(page);
    const created = outcome(page, 'ACTIVE');
    await expect(created.or(outcome(page, 'CONFLICT'))).toBeVisible();
    if (await created.isVisible()) return attempt;
    failures.push(startTime);
    await desktopPane(page).getByTestId('staff-schedule-change-pattern').click();
    await expect(page.getByTestId('new-schedule-staff-form')).toBeVisible();
  }
  throw new Error(`no start time was accepted: ${failures.join(', ')}`);
}

/** A customer of the tenant who has no phone number on file (the A12 outcome), by e-mail. */
export async function seedCustomerWithoutPhone(browser: Browser): Promise<string> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const email = uniqueTestEmail('staff-recorrencia-sem-telefone');
    await loginAsCustomer(page, email, TENANT_SLUG);
    return email;
  } finally {
    await context.close();
  }
}

/** A customer who has a phone, still signed in so the spec can read their own list. */
export async function seedCustomerWithPhone(
  browser: Browser,
): Promise<{ page: Page; email: string; close: () => Promise<void> }> {
  return newLoggedInCustomerPage(browser);
}

/** Releases everything a customer holds, so a held room or location never outlives the spec. */
export async function endAllSchedules(page: Page): Promise<void> {
  for (const schedule of await listMySchedules(page)) {
    if (schedule.status === 'ACTIVE') await endScheduleViaApi(page, schedule.id);
  }
}
