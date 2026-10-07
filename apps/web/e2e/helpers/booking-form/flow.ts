import { expect, type APIResponse, type Locator, type Page } from '@playwright/test';
import type {
  AvailabilityResponse,
  AvailabilitySummaryResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { BFF_URL, WEB_INTERNAL_KEY } from '../auth/shared';
import { createService, makeUniqueServiceName, setResourceRequirements } from '../services';
import { createResource } from '../booking/resource-api';
import { uniqueTestEmail } from '../auth';
import { inviteStaff } from '../staff';

export const TENANT_SLUG = 'lavacar-beloauto';
const TENANT_TIMEZONE = 'America/Sao_Paulo';
export const MANAGER_EMAIL = 'admin@lavacar.com.br';

export function serviceCard(page: Page, serviceId: string): Locator {
  return page.locator(`[data-testid="service-card"][data-service-id="${serviceId}"]`);
}

export const nextButton = (page: Page): Locator => page.getByTestId('step-next');

export async function openBooking(page: Page, slug = TENANT_SLUG): Promise<void> {
  await page.goto(`/${slug}/booking`);
  await expect(page.getByTestId('step-service-selection')).toBeVisible();
}

export async function selectService(page: Page, serviceId: string): Promise<void> {
  await serviceCard(page, serviceId).getByRole('checkbox').check();
}

export function stepIndicator(page: Page, step: number, total: number): Locator {
  return page.getByText(`Passo ${step} de ${total}`, { exact: true });
}

const MAX_DAYS_TRIED = 14;
const SLOTS_LOAD_TIMEOUT_MS = 5_000;

// Opens the first enabled day that lists at least one slot and returns it (YYYY-MM-DD). The first
// enabled day is not enough: the tenant's today stays enabled after the business hours have passed,
// with every slot already behind it, and the booking page hides those.
export async function openFirstDayWithSlots(
  page: Page,
  dayTestId: 'day-option' | 'calendar-day' = 'day-option',
): Promise<string> {
  const days = page.locator(`[data-testid="${dayTestId}"]:not([disabled])`);
  await expect(days.first()).toBeVisible();
  const tried = Math.min(await days.count(), MAX_DAYS_TRIED);
  for (let index = 0; index < tried; index += 1) {
    const day = days.nth(index);
    const date = (await day.getAttribute('data-date')) ?? '';
    await day.click();
    const hasSlot = await page
      .getByTestId('time-slot')
      .first()
      .waitFor({ state: 'visible', timeout: SLOTS_LOAD_TIMEOUT_MS })
      .then(
        () => true,
        () => false,
      );
    if (hasSlot) return date;
  }
  throw new Error(`none of the first ${tried} enabled days lists a bookable slot`);
}

// Picks the first bookable day then its first slot; returns the day (YYYY-MM-DD).
export async function pickFirstSlot(page: Page): Promise<string> {
  const date = await openFirstDayWithSlots(page);
  await page.getByTestId('time-slot').first().click();
  return date;
}

export async function fillGuestContact(page: Page): Promise<void> {
  await page.getByTestId('input-name').fill('E2E Teste');
  await page.getByTestId('input-email').fill('e2e@teste.com.br');
  await page.getByTestId('input-phone').fill('31999999999');
}

export async function confirmBooking(page: Page): Promise<void> {
  await page.getByTestId('step-confirm').click();
}

// A STAFF resource wraps a real staff member (refId); rooms and equipment stand alone.
export async function seedResource(
  page: Page,
  type: 'STAFF' | 'ROOM' | 'EQUIPMENT',
  name = makeUniqueServiceName(`e2e-${type.toLowerCase()}`),
): Promise<{ readonly id: string; readonly name: string }> {
  if (type !== 'STAFF') {
    const resource = await createResource(page, { type, name });
    return { id: resource.id, name };
  }
  const staff = await inviteStaff(page, {
    email: uniqueTestEmail('e2e-pick'),
    firstName: 'Pick',
    lastName: name,
    role: 'STAFF',
  });
  const resource = await createResource(page, { type, name, refId: staff.staffId });
  return { id: resource.id, name };
}

export interface SeededChoiceService {
  readonly serviceId: string;
  readonly name: string;
  readonly resourceIds: readonly string[];
}

// A fixed-duration service whose single STAFF requirement is CUSTOMER_CHOICE, restricted to
// freshly created resources so other tests' resources never leak into the picker.
export async function seedChoiceService(
  page: Page,
  staffCount = 2,
  type: 'STAFF' | 'ROOM' | 'EQUIPMENT' = 'STAFF',
): Promise<SeededChoiceService> {
  const resources = [];
  for (let i = 0; i < staffCount; i += 1) {
    resources.push(await seedResource(page, type));
  }
  const service = await createService(page, {
    name: makeUniqueServiceName('e2e-escolha'),
    description: 'Serviço de teste M23-S11a',
    priceAmount: 150,
    durationMinutes: 60,
    loyaltyPointsValue: 10,
    requiresPickupAddress: false,
    isActive: true,
  });
  await setResourceRequirements(page, service.serviceId, [
    {
      type,
      selectionMode: 'CUSTOMER_CHOICE',
      resourcePoolIds: resources.map((resource) => resource.id),
      requiredQuantity: 1,
    },
  ]);
  return {
    serviceId: service.serviceId,
    name: service.name,
    resourceIds: resources.map((resource) => resource.id),
  };
}

function encodeSelections(picks: readonly ResourceSelectionItem[]): string {
  const selections = picks
    .map(
      (pick) => `${pick.serviceId}:${pick.legIndex ?? '-'}:${pick.resourceType}:${pick.resourceId}`,
    )
    .join(',');
  return selections ? `&resourceSelections=${encodeURIComponent(selections)}` : '';
}

async function readAvailability<T>(res: APIResponse, action: string): Promise<T> {
  if (!res.ok()) throw new Error(`${action} failed: ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

const startsAfterNow = (slot: { readonly startsAt: string }): boolean =>
  Date.parse(slot.startsAt) > Date.now();

export interface FoundSlot {
  readonly date: string;
  readonly startsAt: string;
}

// The first bookable slot from tomorrow on, within the next two weeks, for a service with the given
// picks pinned, read straight from the public availability API (the same one the booking form
// calls). Today is skipped on purpose: late in the day only a slot or two is left, and a spec that
// books the slot it found then finds nothing left to show. The API lists a day's slots untrimmed,
// including hours already behind the clock; booking one of those is rejected, so only a slot that
// starts after now qualifies.
export async function findFirstSlot(
  page: Page,
  serviceId: string,
  picks: readonly ResourceSelectionItem[] = [],
): Promise<FoundSlot> {
  const headers = { 'X-Tenant-Slug': TENANT_SLUG, 'X-Web-Internal-Key': WEB_INTERNAL_KEY! };
  const extra = encodeSelections(picks);
  const from = new Date();
  const to = new Date(from.getTime() + 13 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const summaryRes = await page.request.get(
    `${BFF_URL}/schedule/availability/summary?from=${iso(from)}&to=${iso(to)}&serviceIds=${serviceId}${extra}`,
    { headers },
  );
  const days = await readAvailability<AvailabilitySummaryResponse>(
    summaryRes,
    'availability summary',
  );
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TENANT_TIMEZONE }).format(from);
  for (const day of days.filter((d) => d.available && d.date > today)) {
    const res = await page.request.get(
      `${BFF_URL}/schedule/availability?date=${day.date}&serviceIds=${serviceId}${extra}`,
      { headers },
    );
    const body = await readAvailability<AvailabilityResponse>(res, 'availability');
    const slot = body.slots.find(startsAfterNow);
    if (slot) return { date: day.date, startsAt: slot.startsAt };
  }
  throw new Error(`no available slot found for service ${serviceId}`);
}

// The slots the booking page offers on a day: the availability API lists today's hours that are
// already behind the clock too, and the page hides them.
export async function slotsOnDate(
  page: Page,
  serviceId: string,
  date: string,
  picks: readonly ResourceSelectionItem[] = [],
): Promise<AvailabilityResponse['slots']> {
  const extra = encodeSelections(picks);
  const res = await page.request.get(
    `${BFF_URL}/schedule/availability?date=${date}&serviceIds=${serviceId}${extra}`,
    { headers: { 'X-Tenant-Slug': TENANT_SLUG, 'X-Web-Internal-Key': WEB_INTERNAL_KEY! } },
  );
  return (await readAvailability<AvailabilityResponse>(res, 'availability')).slots.filter(
    startsAfterNow,
  );
}

// Books a slot directly as a guest through the BFF (test setup for conflicts); returns the status.
export async function bookAsGuest(
  page: Page,
  body: {
    readonly serviceIds: readonly string[];
    readonly scheduledAt: string;
    readonly resourceSelections?: readonly ResourceSelectionItem[];
  },
): Promise<number> {
  const res = await page.request.post(`${BFF_URL}/bookings`, {
    headers: { 'X-Tenant-Slug': TENANT_SLUG, 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
    data: {
      contactName: 'E2E Conflito',
      contactEmail: `conflito-${Date.now()}@e2e.example.com`,
      contactPhone: '+5531999999999',
      ...body,
    },
  });
  return res.status();
}
