import { expect, type Locator, type Page } from '@playwright/test';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
import { TENANT_SLUG } from './booking-form';
import { setBookingPolicy, setResourceRequirements } from './services';
import { seedResource } from './booking-form/flow';
import { seedFixedService, type SeededService } from './booking-form/seeds';

const WEB_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const TENANT_TIMEZONE = 'America/Sao_Paulo';

// "YYYY-MM-DD" for `daysAhead` days from now on the TENANT's calendar (docs/ENGINEERING_RULES_TESTING.md
// § An E2E test that computes "today") — the runner's own clock and zone diverge from it for hours daily.
export function tenantDate(daysAhead: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TENANT_TIMEZONE }).format(
    new Date(Date.now() + daysAhead * 86_400_000),
  );
}

// M23-S12 — a fixed-duration service that accepts recurring schedules, seeded by a signed-in
// manager `page`. Recurrence needs a single-resource service (no bundle or leg), and the policy
// flag is off by default. The service gets its own room in a fungible pool, which matches the
// RESOLVE_PER_OCCURRENCE policy the schedules are created with and keeps one test's occurrences
// from ever taking another test's slot.
export interface SeededRecurringService extends SeededService {
  /** The service's own room: a resource-scoped closure on it affects this service alone. */
  readonly roomId: string;
}

export async function seedRecurrenceEligibleService(
  page: Page,
  options: { readonly approvalMode?: 'AUTO_CONFIRM' | 'MANUAL_APPROVAL' } = {},
): Promise<SeededRecurringService> {
  const room = await seedResource(page, 'ROOM');
  const service = await seedFixedService(page, 'e2e-recorrencia');
  await setResourceRequirements(page, service.serviceId, [
    { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', resourcePoolIds: [room.id] },
  ]);
  // AUTO_CONFIRM by default: an unset approval mode counts as manual, which would leave every
  // schedule PENDING_APPROVAL with no bookings to list.
  await setBookingPolicy(page, service.serviceId, {
    recurrenceEligible: true,
    defaultApprovalMode: options.approvalMode ?? 'AUTO_CONFIRM',
  });
  return { ...service, roomId: room.id };
}

// Start times tried in turn: tests share the tenant's default staff pool, so a slot another worker's
// schedule already holds answers 409 and the next one is tried; hours the tenant is closed answer
// 409 too. Half-hour steps across a working day.
const CANDIDATE_START_TIMES: readonly string[] = Array.from({ length: 20 }, (_, i) => {
  const minutes = 8 * 60 + i * 30;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
});

export interface CreatedSchedule {
  readonly id: string;
  readonly status: string;
  /** The start time the backend accepted. */
  readonly startTime: string;
}

export interface ScheduleTerm {
  /** Days from today (tenant calendar) to the first day of the term. */
  readonly startsInDays?: number;
  readonly termDays?: number;
  /** Start times to try, in order; defaults to a working day in half-hour steps. */
  readonly startTimes?: readonly string[];
}

// A weekday schedule over a four-week term (about 20 occurrences — four pages of five), created
// straight through the API as the signed-in customer `page`. Returns once a start time is accepted.
export async function createRecurringScheduleViaApi(
  page: Page,
  serviceId: string,
  term: ScheduleTerm = {},
): Promise<CreatedSchedule> {
  const { startsInDays = 5, termDays = 27, startTimes = CANDIDATE_START_TIMES } = term;
  const failures: string[] = [];
  for (const startTime of startTimes) {
    const res = await page.request.post(`${WEB_URL}/v1/recurring-booking-schedules`, {
      data: {
        serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          startTime,
          durationMinutes: 30,
        },
        assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
        startsOn: tenantDate(startsInDays),
        endsOn: tenantDate(startsInDays + termDays),
      },
    });
    if (res.status() === 201) {
      return { ...((await res.json()) as Omit<CreatedSchedule, 'startTime'>), startTime };
    }
    failures.push(`${startTime}: ${res.status()} ${await res.text()}`);
    if (res.status() !== 409) break;
  }
  throw new Error(`could not create a recurring schedule — ${failures.join(', ')}`);
}

// ── M23-S17: driving the customer's "new recurring reservation" form ──────────────────────────

export const NEW_SCHEDULE_PATH = `/${TENANT_SLUG}/my-account/recurring-schedules/new`;

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
export type FormWeekday = (typeof WEEKDAY_NAMES)[number];

/** The weekday of a tenant-calendar day ("YYYY-MM-DD" has the same weekday in every timezone). */
export function weekdayOf(isoDate: string): FormWeekday {
  return WEEKDAY_NAMES[new Date(`${isoDate}T00:00:00Z`).getUTCDay()]!;
}

export interface FormPattern {
  readonly service: SeededService;
  readonly weekdays: readonly FormWeekday[];
  /** "HH:mm", 24h, picked with the shared TimePicker. */
  readonly startTime: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

// The action pane is rendered twice (after the content on mobile, beside it on desktop); the
// specs run at desktop width, so the desktop copy is the one a person can click.
export function desktopPane(page: Page): Locator {
  return page.getByTestId('action-pane-desktop');
}

// A day is picked from the shadcn Calendar popover: open the field, walk to the day's month with
// the shared "next month" button, click the day cell by its data-day.
async function pickFormDay(page: Page, fieldTestId: string, isoDate: string): Promise<void> {
  await page.getByTestId(fieldTestId).click();
  const cell = page.locator(`[data-day="${isoDate}"] button`);
  for (let step = 0; step < 6 && !(await cell.isVisible()); step += 1) {
    await page.getByTestId('calendar-next-month').click();
  }
  await cell.click();
}

async function chooseTimePart(page: Page, testId: string, value: string): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: value, exact: true }).click();
}

/** Types the pattern into the form, leaving it on step 1 (the review is one click further). */
export async function fillRecurringForm(page: Page, pattern: FormPattern): Promise<void> {
  await page.getByTestId('new-schedule-service').click();
  await page.getByRole('option', { name: new RegExp(`^${pattern.service.name}`) }).click();

  // Clear the weekdays left from a previous attempt, then press the wanted ones.
  for (const pill of await page.getByTestId('new-schedule-weekday').all()) {
    const value = await pill.getAttribute('data-value');
    const pressed = (await pill.getAttribute('aria-pressed')) === 'true';
    const wanted = pattern.weekdays.includes(value as FormWeekday);
    if (pressed !== wanted) await pill.click();
  }

  const [hour, minute] = pattern.startTime.split(':') as [string, string];
  await chooseTimePart(page, 'new-schedule-time-hour', hour);
  await chooseTimePart(page, 'new-schedule-time-minute', minute);

  await pickFormDay(page, 'new-schedule-starts-on', pattern.startsOn);
  await pickFormDay(page, 'new-schedule-ends-on', pattern.endsOn);
}

/** Review, then confirm: leaves the page on whichever outcome the backend answered. */
export async function submitRecurringForm(page: Page): Promise<void> {
  await desktopPane(page).getByTestId('new-schedule-review').click();
  await desktopPane(page).getByTestId('new-schedule-confirm').click();
}

// Half-hour-aligned hours tried in turn, like the API helper: the tenant's working hours and the
// slots other workers' schedules already hold answer 409, and the conflict screen offers the way
// back with the pattern kept.
const FORM_START_TIMES: readonly string[] = ['11:00', '14:00', '09:00', '16:00', '10:00', '15:00'];

/**
 * Creates a schedule through the form, trying start times until the backend accepts one. Returns
 * the pattern that was accepted; leaves the page on the created or the pending state.
 */
export async function createThroughForm(
  page: Page,
  pattern: Omit<FormPattern, 'startTime'>,
  accepted: 'new-schedule-created' | 'recurring-schedule-pending',
): Promise<FormPattern> {
  const failures: string[] = [];
  for (const startTime of FORM_START_TIMES) {
    const attempt = { ...pattern, startTime };
    await fillRecurringForm(page, attempt);
    await submitRecurringForm(page);
    const outcome = page.getByTestId(accepted).or(page.getByTestId('new-schedule-conflict'));
    await expect(outcome).toBeVisible();
    if (await page.getByTestId(accepted).isVisible()) return attempt;
    failures.push(startTime);
    await desktopPane(page).getByTestId('new-schedule-change-pattern').click();
  }
  throw new Error(`no start time was accepted: ${failures.join(', ')}`);
}

export async function listMySchedules(page: Page): Promise<RecurringBookingScheduleListItem[]> {
  const res = await page.request.get(`${WEB_URL}/v1/recurring-booking-schedules?limit=100`);
  expect(res.ok(), `list schedules: ${res.status()}`).toBe(true);
  return ((await res.json()) as { items: RecurringBookingScheduleListItem[] }).items;
}
