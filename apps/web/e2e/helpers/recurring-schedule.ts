import { expect, type Page } from '@playwright/test';
import type { RecurringBookingScheduleListItem } from '@ikaro/types';
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
export async function seedRecurrenceEligibleService(page: Page): Promise<SeededService> {
  const room = await seedResource(page, 'ROOM');
  const service = await seedFixedService(page, 'e2e-recorrencia');
  await setResourceRequirements(page, service.serviceId, [
    { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', resourcePoolIds: [room.id] },
  ]);
  // AUTO_CONFIRM: an unset approval mode counts as manual, which would leave every schedule
  // PENDING_APPROVAL with no bookings to list.
  await setBookingPolicy(page, service.serviceId, {
    recurrenceEligible: true,
    defaultApprovalMode: 'AUTO_CONFIRM',
  });
  return service;
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
}

// A weekday schedule over a four-week term (about 20 occurrences — four pages of five), created
// straight through the API as the signed-in customer `page`. Returns once a start time is accepted.
export async function createRecurringScheduleViaApi(
  page: Page,
  serviceId: string,
): Promise<CreatedSchedule> {
  const failures: string[] = [];
  for (const startTime of CANDIDATE_START_TIMES) {
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
        startsOn: tenantDate(5),
        endsOn: tenantDate(5 + 27),
      },
    });
    if (res.status() === 201) return (await res.json()) as CreatedSchedule;
    failures.push(`${startTime}: ${res.status()} ${await res.text()}`);
    if (res.status() !== 409) break;
  }
  throw new Error(`could not create a recurring schedule — ${failures.join(', ')}`);
}

export async function listMySchedules(page: Page): Promise<RecurringBookingScheduleListItem[]> {
  const res = await page.request.get(`${WEB_URL}/v1/recurring-booking-schedules?limit=100`);
  expect(res.ok(), `list schedules: ${res.status()}`).toBe(true);
  return ((await res.json()) as { items: RecurringBookingScheduleListItem[] }).items;
}
