import { expect, test, type Page } from '@playwright/test';
import {
  createUniqueScheduleBooking,
  createUniqueScheduleClosure,
  createUniqueScheduleOpening,
  createScheduleBooking,
  loginAsScheduleStaff,
  removeScheduleClosure,
  removeScheduleOpening,
  scheduleRoute,
  uniqueLabel,
  weekDayIndex,
} from '@/e2e/helpers/schedule';
import { uniqueTestEmail } from '@/e2e/helpers/auth';

function installHydrationGuard(page: Page): string[] {
  const hydrationErrors: string[] = [];

  function record(message: string): void {
    if (
      message.includes(
        "Hydration failed because the server rendered HTML didn't match the client",
      ) ||
      message.includes("didn't match the client") ||
      message.includes('hydration mismatch')
    ) {
      hydrationErrors.push(message);
    }
  }

  page.on('pageerror', (error) => {
    record(error.message);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      record(message.text());
    }
  });

  return hydrationErrors;
}

test.describe('schedule page coverage', () => {
  test('desktop browsers default to week view and can switch to day view', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await loginAsScheduleStaff(page);

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
    await loginAsScheduleStaff(page);

    await page.goto('/dashboard/schedule');

    await expect(page.getByTestId('schedule-mobile-view')).toBeVisible();
    await expect(page.getByTestId('schedule-week-view')).toHaveCount(0);
  });

  test('schedule route hydrates without mismatch errors', async ({ page }) => {
    const hydrationErrors = installHydrationGuard(page);

    await page.setViewportSize({ width: 1440, height: 1100 });
    await loginAsScheduleStaff(page);
    await page.goto('/dashboard/schedule');

    await expect(page.getByTestId('schedule-week-view')).toBeVisible();
    expect(hydrationErrors, hydrationErrors.join('\n')).toEqual([]);
  });

  test('manager can block and then remove a closure on an open day', async ({ page }) => {
    await loginAsScheduleStaff(page);

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

  test('manager sees a translated error, not raw backend text, when closure removal fails', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const closure = await createUniqueScheduleClosure(
      page,
      {
        reason: 'STAFF_DAY_OFF',
        notes: 'E2E closure error path',
      },
      124,
    );
    const dateKey = closure.dateKey;

    await page.route('**/v1/schedule/closures/**', (route) => {
      if (route.request().method() !== 'DELETE') return route.continue();
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'about:blank',
          title: 'Bad Request',
          status: 400,
          code: 'BOOKING_SCHEDULE_CLOSURE_NOT_FOUND',
          detail: `Schedule closure ${closure.id} not found for tenant`,
        }),
      });
    });

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

    const dialogError = page.getByRole('dialog').getByTestId('action-sheet-error');
    await expect(dialogError).toContainText('Fechamento de agenda não encontrado.');
    await expect(dialogError).not.toContainText('not found for tenant');

    // The mocked DELETE never reached the backend — the closure still exists, remove it for real.
    await removeScheduleClosure(page, closure.id);
  });

  test('manager can open a special day and then remove the opening', async ({ page }) => {
    await loginAsScheduleStaff(page);

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
    await loginAsScheduleStaff(page);

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
    await expect(page.getByRole('checkbox', { name: 'Pendente' })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Pendente' }).click();

    await expect(page.getByRole('link', { name: pendingName })).toBeVisible();
    await expect(page.getByRole('link', { name: approvedName })).toBeVisible();
  });

  test('booking detail opened from schedule returns to the same schedule route', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

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

  test('loading a later week schedule route shows that week schedule data', async ({ page }) => {
    await loginAsScheduleStaff(page);

    const contactName = uniqueLabel('next-week');
    const booking = await createUniqueScheduleBooking(
      page,
      {
        contactName,
        contactEmail: uniqueTestEmail('schedule-next-week'),
        approved: true,
        time: '14:30',
      },
      14,
    );

    await page.goto(scheduleRoute(booking.dateKey));

    await expect(page.getByRole('link', { name: contactName })).toHaveAttribute(
      'href',
      new RegExp(`/dashboard/bookings/${booking.bookingId}\\?returnTo=`),
    );
    await expect(page.getByRole('link', { name: contactName })).toBeVisible();
    await expect(
      page.getByTestId('week-day').filter({ hasText: booking.dateKey.slice(8, 10) }),
    ).toBeVisible();
  });
});
