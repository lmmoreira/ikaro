import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import { newLoggedInCustomerPage } from './availability-alert';
import {
  createRecurringScheduleViaApi,
  endScheduleViaApi,
  type CreatedSchedule,
  type ScheduleTerm,
} from './recurring-schedule';

const WEB_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

// M23-S13 — the staff side of a recurring-schedule request (UC-071): the Agenda's "Precisa de ação"
// card, the approval screen and its confirmation sheet. The request itself is made by a fresh
// customer straight through the API, because the staff screens are what is under test.

export const AGENDA_URL = '/dashboard/bookings';

export function requestUrl(scheduleId: string): string {
  return `/dashboard/bookings/recurring/${scheduleId}`;
}

/** The Agenda card of one request. The tenant is shared, so a spec only ever looks at its own. */
export function recurringCard(page: Page, scheduleId: string): Locator {
  return page.locator(`[data-testid="recurring-schedule-card"][data-schedule-id="${scheduleId}"]`);
}

export interface PendingRequest {
  readonly schedule: CreatedSchedule;
  /** The customer who asked, still signed in, for the clean-up. */
  readonly customerPage: Page;
  readonly close: () => Promise<void>;
}

/**
 * A request waiting for a decision: a fresh customer asks for a schedule of a `MANUAL_APPROVAL`
 * service. The service must be seeded with that approval mode by the caller.
 */
export async function createPendingRequest(
  browser: Browser,
  serviceId: string,
  term: ScheduleTerm = {},
): Promise<PendingRequest> {
  const customer = await newLoggedInCustomerPage(browser);
  try {
    const schedule = await createRecurringScheduleViaApi(customer.page, serviceId, term);
    expect(schedule.status).toBe('PENDING_APPROVAL');
    return { schedule, customerPage: customer.page, close: customer.close };
  } catch (error) {
    await customer.close();
    throw error;
  }
}

/** Rejects a request as the signed-in staff `page`, so a spec never leaves one waiting. */
export async function rejectRequestViaApi(page: Page, scheduleId: string): Promise<void> {
  const res = await page.request.post(
    `${WEB_URL}/v1/recurring-booking-schedules/${scheduleId}/reject`,
  );
  expect(res.ok(), `reject schedule ${scheduleId}: ${res.status()}`).toBe(true);
}

/** Opens the Agenda and goes from the request's card to its approval screen with "Ver pedido". */
export async function openRequestFromAgenda(page: Page, scheduleId: string): Promise<void> {
  await page.goto(AGENDA_URL);
  const card = recurringCard(page, scheduleId);
  await expect(card).toBeVisible({ timeout: 20_000 });
  await card.getByRole('link', { name: 'Ver pedido', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${requestUrl(scheduleId)}$`));
  await expect(page.getByTestId('recurring-approval-page')).toBeVisible();
}

/**
 * Presses a decision on the approval screen and confirms it in the sheet. The action panel is
 * rendered once; on desktop it sits in the right column.
 */
export async function decide(page: Page, kind: 'approve' | 'reject'): Promise<void> {
  const [open, confirm] =
    kind === 'approve'
      ? ['Aprovar recorrência', 'Confirmar aprovação']
      : ['Recusar', 'Confirmar recusa'];
  await page.getByRole('button', { name: open, exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: confirm }).click();
}

/** Releases what an approved request created, so its slots never outlive the spec. */
export async function endApprovedSchedule(
  request: PendingRequest,
  scheduleId: string,
): Promise<void> {
  await endScheduleViaApi(request.customerPage, scheduleId);
}
