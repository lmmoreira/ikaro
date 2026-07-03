import { expect, test, type Page } from '@playwright/test';

const BFF_URL = process.env.PLAYWRIGHT_BFF_URL ?? 'http://127.0.0.1:3002/v1';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const TENANT_SLUG = 'lavacar-beloauto';
const STAFF_EMAIL = 'lm.moreira@gmail.com';
const DEFAULT_SERVICE_ID = '00000000-0000-7000-8003-000000000001';

if (!INTERNAL_API_KEY) {
  throw new Error('PLAYWRIGHT/INTERNAL_API_KEY is required for schedule E2E helpers');
}

function getRequiredInternalApiKey(): string {
  return INTERNAL_API_KEY!;
}

const REQUIRED_INTERNAL_API_KEY = getRequiredInternalApiKey();

function uniqueTestEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}@e2e.example.com`;
}

function uniqueLabel(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

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

function scheduleRoute(dateKey: string): string {
  const start = weekStartKey(dateKey);
  return `/dashboard/schedule?weekStart=${start}&date=${dateKey}`;
}

function weekDayIndex(dateKey: string): number {
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

async function addAccessTokenCookie(page: Page, accessToken: string): Promise<void> {
  await page.context().addCookies([
    {
      name: 'access_token',
      value: accessToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    {
      name: 'access_token',
      value: accessToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

async function loginAsStaff(page: Page, email: string, tenantSlug: string): Promise<void> {
  const response = await page.request.post(`${BFF_URL}/auth/dev-login`, {
    headers: { 'X-Internal-Key': REQUIRED_INTERNAL_API_KEY },
    data: { email, tenantSlug, type: 'staff' },
  });

  if (!response.ok()) {
    throw new Error(`dev-login failed: ${response.status()} ${await response.text()}`);
  }

  const body = (await response.json()) as { accessToken: string };
  await addAccessTokenCookie(page, body.accessToken);
}

async function createUniqueScheduleClosure(
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

async function removeScheduleClosure(page: Page, id: string): Promise<void> {
  const response = await page.request.delete(`${BFF_URL}/schedule/closures/${id}`);
  if (response.status() === 404) {
    return;
  }

  if (!response.ok()) {
    throw new Error(`removeScheduleClosure failed: ${response.status()} ${await response.text()}`);
  }
}

async function createUniqueScheduleOpening(
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

async function removeScheduleOpening(page: Page, id: string): Promise<void> {
  const response = await page.request.delete(`${BFF_URL}/schedule/openings/${id}`);
  if (response.status() === 404) {
    return;
  }

  if (!response.ok()) {
    throw new Error(`removeScheduleOpening failed: ${response.status()} ${await response.text()}`);
  }
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
      'X-Tenant-Slug': TENANT_SLUG,
    },
    data: {
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: '+5511999999999',
      scheduledAt: toScheduledAt(body.dateKey, body.time ?? '10:00'),
      serviceIds: [DEFAULT_SERVICE_ID],
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

async function createUniqueScheduleBooking(
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

test.describe('schedule page coverage', () => {
  test('desktop browsers default to week view and can switch to day view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    await page.goto('/dashboard/schedule');

    await expect(page.getByTestId('schedule-week-view')).toBeVisible();
    await expect(page.getByTestId('schedule-week-day-card')).toHaveCount(7);

    await page.getByRole('combobox', { name: 'Visualização' }).click();
    await page.getByRole('option', { name: 'Dia' }).click();

    await expect(page.getByTestId('schedule-mobile-view')).toBeVisible();
    await expect(page.getByTestId('schedule-week-view')).toHaveCount(0);
  });

  test('mobile browsers default to day view', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    await page.goto('/dashboard/schedule');

    await expect(page.getByTestId('schedule-mobile-view')).toBeVisible();
    await expect(page.getByTestId('schedule-week-view')).toHaveCount(0);
  });

  test('manager can block and then remove a closure on an open day', async ({ page }) => {
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    const closure = await createUniqueScheduleClosure(
      page,
      {
        reason: 'STAFF_DAY_OFF',
        notes: 'E2E closure',
      },
      120,
    );
    const dateKey = closure.dateKey;

    await page.goto(scheduleRoute(dateKey));

    const closureButton = page
      .getByTestId('schedule-week-day-card')
      .nth(weekDayIndex(dateKey))
      .locator('button.absolute.overflow-hidden.rounded-xl')
      .filter({ hasText: 'Folga da equipe' })
      .first();

    await expect(closureButton).toBeVisible();

    await closureButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover bloqueio' }).click();

    await expect(closureButton).toHaveCount(0);
    await removeScheduleClosure(page, closure.id);
  });

  test('manager can open a special day and then remove the opening', async ({ page }) => {
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    const opening = await createUniqueScheduleOpening(
      page,
      {
        startTime: '08:00',
        endTime: '12:00',
        notes: 'E2E opening',
      },
      121,
    );
    const dateKey = opening.dateKey;

    await page.goto(scheduleRoute(dateKey));

    const openingButton = page
      .getByTestId('schedule-week-day-card')
      .nth(weekDayIndex(dateKey))
      .locator('button.absolute.overflow-hidden.rounded-xl')
      .filter({ hasText: 'Abertura especial' })
      .first();

    await expect(openingButton).toBeVisible();
    await openingButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Remover abertura' }).click();

    await expect(openingButton).toHaveCount(0);
    await removeScheduleOpening(page, opening.id);
  });

  test('pending bookings stay hidden until the status filter is enabled', async ({ page }) => {
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    const approvedName = uniqueLabel('approved');
    const pendingName = uniqueLabel('pending');
    const approved = await createUniqueScheduleBooking(
      page,
      {
        contactName: approvedName,
        contactEmail: uniqueTestEmail('schedule-approved'),
        approved: true,
        time: '10:00',
      },
      122,
    );

    const dateKey = approved.dateKey;

    await createScheduleBooking(page, {
      dateKey,
      contactName: pendingName,
      contactEmail: uniqueTestEmail('schedule-pending'),
      approved: false,
      time: '13:00',
    });

    await page.goto(scheduleRoute(dateKey));

    await expect(page.getByRole('link', { name: approvedName })).toBeVisible();
    await expect(page.getByRole('link', { name: pendingName })).toHaveCount(0);

    await page.getByRole('button', { name: 'Filtrar status' }).click();
    await page.getByRole('checkbox', { name: 'Pendente' }).click();

    await expect(page.getByRole('link', { name: pendingName })).toBeVisible();
    await expect(page.getByRole('link', { name: approvedName })).toBeVisible();
  });

  test('booking detail opened from schedule returns to the same schedule route', async ({
    page,
  }) => {
    await loginAsStaff(page, STAFF_EMAIL, TENANT_SLUG);

    const contactName = uniqueLabel('schedule-detail');
    const booking = await createUniqueScheduleBooking(
      page,
      {
        contactName,
        contactEmail: uniqueTestEmail('schedule-detail'),
        approved: true,
        time: '15:00',
      },
      123,
    );
    const dateKey = booking.dateKey;

    await page.goto(scheduleRoute(dateKey));

    const expectedReturnTo = scheduleRoute(dateKey);
    const bookingLink = page.getByRole('link', { name: contactName }).first();
    await expect(bookingLink).toHaveAttribute(
      'href',
      new RegExp(`/dashboard/bookings/${booking.bookingId}\\?returnTo=`),
    );

    const href = await bookingLink.getAttribute('href');
    if (!href) {
      throw new Error('Expected booking link to have an href');
    }

    await page.goto(href);
    await expect(page).toHaveURL(
      new RegExp(`/dashboard/bookings/${booking.bookingId}\\?returnTo=`),
    );
    await expect(page.locator(`a[href="${expectedReturnTo}"]`)).toBeVisible();

    await page.locator(`a[href="${expectedReturnTo}"]`).click();
    await expect(page).toHaveURL(expectedReturnTo);
  });
});
