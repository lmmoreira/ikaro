import type { Page } from '@playwright/test';
import { loginAsStaff } from '../auth';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://127.0.0.1:3002/v1';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

export const SCHEDULE_TENANT_SLUG = 'lavacar-beloauto';
export const SCHEDULE_STAFF_EMAIL = 'lm.moreira@gmail.com';
export const SCHEDULE_DEFAULT_SERVICE_ID = '00000000-0000-7000-8003-000000000001';

if (!INTERNAL_API_KEY) {
  throw new Error('PLAYWRIGHT/INTERNAL_API_KEY is required for schedule E2E helpers');
}

function uniqueLabel(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export { uniqueLabel };

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function fromDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00`);
}

function isClosedDay(dateKey: string): boolean {
  return fromDateKey(dateKey).getDay() === 0;
}

function weekStartKey(dateKey: string): string {
  const date = fromDateKey(dateKey);
  const day = date.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + delta);
  return toDateKey(date);
}

export function scheduleRoute(dateKey: string): string {
  const start = weekStartKey(dateKey);
  return `/dashboard/schedule?weekStart=${start}&date=${dateKey}`;
}

export function weekDayIndex(dateKey: string): number {
  const start = fromDateKey(weekStartKey(dateKey));
  const target = fromDateKey(dateKey);
  return Math.round((target.getTime() - start.getTime()) / 86_400_000);
}

function nextOpenDateKey(offsetDays = 7): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  while (isClosedDay(toDateKey(date))) {
    date.setDate(date.getDate() + 1);
  }
  return toDateKey(date);
}

function nextClosedDateKey(offsetDays = 7): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  while (!isClosedDay(toDateKey(date))) {
    date.setDate(date.getDate() + 1);
  }
  return toDateKey(date);
}

function toScheduledAt(dateKey: string, time = '10:00'): string {
  return new Date(`${dateKey}T${time}:00-03:00`).toISOString();
}

export async function loginAsScheduleStaff(page: Page): Promise<void> {
  await loginAsStaff(page, SCHEDULE_STAFF_EMAIL, SCHEDULE_TENANT_SLUG);
}

export async function createUniqueScheduleClosure(
  page: Page,
  body: {
    readonly reason?: 'STAFF_DAY_OFF' | 'MAINTENANCE' | 'HOLIDAY';
    readonly startTime?: string;
    readonly endTime?: string;
    readonly notes?: string;
  },
  startOffset: number,
): Promise<{ readonly id: string; readonly dateKey: string }> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const dateKey = nextOpenDateKey(startOffset + attempt);
    const response = await page.request.post(`${BFF_URL}/schedule/closures`, {
      data: { date: dateKey, ...body },
    });

    if (response.ok()) {
      const created = (await response.json()) as { readonly id: string };
      return { ...created, dateKey };
    }

    if (response.status() !== 409) {
      throw new Error(
        `createUniqueScheduleClosure failed: ${response.status()} ${await response.text()}`,
      );
    }
  }

  throw new Error('Unable to find a free date for schedule closure test');
}

export async function removeScheduleClosure(page: Page, id: string): Promise<void> {
  const response = await page.request.delete(`${BFF_URL}/schedule/closures/${id}`);
  if (response.status() === 404) {
    return;
  }

  if (!response.ok()) {
    throw new Error(`removeScheduleClosure failed: ${response.status()} ${await response.text()}`);
  }
}

export async function createUniqueScheduleOpening(
  page: Page,
  body: {
    readonly startTime: string;
    readonly endTime: string;
    readonly notes?: string;
  },
  startOffset: number,
): Promise<{ readonly id: string; readonly dateKey: string }> {
  for (let attempt = 0; attempt < 52; attempt += 1) {
    const dateKey = nextClosedDateKey(startOffset + attempt * 7);
    const response = await page.request.post(`${BFF_URL}/schedule/openings`, {
      data: { date: dateKey, ...body },
    });

    if (response.ok()) {
      const created = (await response.json()) as { readonly id: string };
      return { ...created, dateKey };
    }

    if (response.status() !== 409) {
      throw new Error(
        `createUniqueScheduleOpening failed: ${response.status()} ${await response.text()}`,
      );
    }
  }

  throw new Error('Unable to find a free date for schedule opening test');
}

export async function removeScheduleOpening(page: Page, id: string): Promise<void> {
  const response = await page.request.delete(`${BFF_URL}/schedule/openings/${id}`);
  if (response.status() === 404) {
    return;
  }

  if (!response.ok()) {
    throw new Error(`removeScheduleOpening failed: ${response.status()} ${await response.text()}`);
  }
}

export async function createUniqueScheduleBooking(
  page: Page,
  body: {
    readonly contactName: string;
    readonly contactEmail: string;
    readonly approved?: boolean;
    readonly time?: string;
  },
  startOffset: number,
): Promise<{ readonly bookingId: string; readonly scheduledAt: string; readonly dateKey: string }> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const dateKey = nextOpenDateKey(startOffset + attempt);
    try {
      const created = await createScheduleBooking(page, { dateKey, ...body });
      return { ...created, dateKey };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('409')) {
        throw error;
      }
    }
  }

  throw new Error('Unable to find a free date for schedule booking test');
}

async function createScheduleBooking(
  page: Page,
  body: {
    readonly dateKey: string;
    readonly contactName: string;
    readonly contactEmail: string;
    readonly approved?: boolean;
    readonly time?: string;
  },
): Promise<{ readonly bookingId: string; readonly scheduledAt: string }> {
  const createResponse = await page.request.post(`${BFF_URL}/bookings`, {
    headers: {
      'X-Tenant-Slug': SCHEDULE_TENANT_SLUG,
    },
    data: {
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: '+5511999999999',
      scheduledAt: toScheduledAt(body.dateKey, body.time ?? '10:00'),
      serviceIds: [SCHEDULE_DEFAULT_SERVICE_ID],
    },
  });

  if (!createResponse.ok()) {
    throw new Error(
      `createScheduleBooking failed: ${createResponse.status()} ${await createResponse.text()}`,
    );
  }

  const created = (await createResponse.json()) as {
    readonly bookingId: string;
    readonly scheduledAt: string;
  };

  if (body.approved) {
    const approveResponse = await page.request.patch(
      `${BFF_URL}/bookings/${created.bookingId}/approve`,
      { data: {} },
    );

    if (!approveResponse.ok()) {
      throw new Error(
        `approveScheduleBooking failed: ${approveResponse.status()} ${await approveResponse.text()}`,
      );
    }
  }

  return created;
}

export { createScheduleBooking };
