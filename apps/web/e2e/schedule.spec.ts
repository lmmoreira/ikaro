import { expect, test, type Page } from '@playwright/test';
import {
  createScheduleClosureAt,
  createScheduleOpeningAt,
  createUniqueScheduleBooking,
  createUniqueScheduleClosure,
  createUniqueScheduleOpening,
  createScheduleBooking,
  loginAsScheduleStaff,
  nextOpenDateKey,
  removeScheduleClosure,
  removeScheduleOpening,
  scheduleRoute,
  uniqueLabel,
  weekDayIndex,
} from '@/e2e/helpers/schedule';
import { uniqueTestEmail } from '@/e2e/helpers/auth';
import { createResource, deactivateResource } from '@/e2e/helpers/booking';

// TD44 Story 4 — lavacar-beloauto's own seed data: the default schedule service
// (SCHEDULE_DEFAULT_SERVICE_ID, 'Lavagem Simples') is a 30-minute service, and this tenant's own
// `slotGranularityMinutes` (docs/21-TENANTS_SETTINGS_SCHEMA.md) is also 30 — so every booking
// created via the default helper below is already exactly at minimum granularity, with no extra
// service setup needed. 'Lavagem Completa' (60 min) is this tenant's shortest longer-than-minimum
// service, used as the non-regression counterpart.
const SCHEDULE_LONGER_SERVICE_ID = '00000000-0000-7000-8003-000000000002';

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

    try {
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

      // Only closures/openings render as <button> timeline blocks (bookings render as <Link>),
      // and this date has exactly one — no need to match on translated copy.
      const closureButton = page
        .getByTestId('schedule-week-day-card')
        .nth(weekDayIndex(dateKey))
        .locator('button.absolute.overflow-hidden.rounded-xl')
        .first();

      await expect(closureButton).toBeVisible();

      await closureButton.click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await dialog.locator('button[type="submit"]').click();

      const dialogError = dialog.getByTestId('action-sheet-error');
      await expect(dialogError).toContainText('Fechamento de agenda não encontrado.');
      await expect(dialogError).not.toContainText('not found for tenant');
    } finally {
      // The mocked DELETE never reached the backend — the closure still exists, remove it for
      // real even if an assertion above failed.
      await removeScheduleClosure(page, closure.id);
    }
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
      page.locator(`[data-testid="week-day"][data-date="${booking.dateKey}"]`),
    ).toBeVisible();
  });

  test('manager checks a resource in the filter menu — a resource-scoped closure is visible only then, not on the default tenant-wide view (M21-S05)', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const resource = await createResource(page, {
      type: 'ROOM',
      name: uniqueLabel('E2E Sala'),
    });

    try {
      const closure = await createUniqueScheduleClosure(
        page,
        { reason: 'MAINTENANCE', notes: 'E2E resource-scoped closure', resourceId: resource.id },
        125,
      );
      const dateKey = closure.dateKey;

      try {
        await page.goto(scheduleRoute(dateKey));

        // Locale-independent: matched by the closure's own id, not by any rendered text
        // (docs/08-TESTING_STRATEGY.md § E2E Selector Strategy forbids matching translated copy —
        // the block's title/subtitle are the translated reason label and time range).
        const closureButton = page.getByTestId(`schedule-closure-block-${closure.id}`);

        // No resource checked — the default tenant-wide view — the resource-scoped closure must
        // not appear.
        await expect(closureButton).toHaveCount(0);

        await page.getByRole('button', { name: 'Filtrar recurso' }).click();
        await page.getByRole('checkbox', { name: resource.name }).check();
        await page.getByRole('button', { name: 'Fechar' }).click();

        await expect(closureButton).toBeVisible();

        await page.getByRole('button', { name: 'Filtrar recurso' }).click();
        await page.getByRole('checkbox', { name: resource.name }).uncheck();
        await page.getByRole('button', { name: 'Fechar' }).click();

        await expect(closureButton).toHaveCount(0);
      } finally {
        await removeScheduleClosure(page, closure.id);
      }
    } finally {
      await deactivateResource(page, resource.id);
    }
  });

  test('a tenant-wide closure stays visible alongside a resource-scoped one when a resource is checked, each labeled and laid out side-by-side (M21-S05)', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const resource = await createResource(page, {
      type: 'ROOM',
      name: uniqueLabel('E2E Estúdio'),
    });

    try {
      const tenantWideClosure = await createUniqueScheduleClosure(
        page,
        {
          reason: 'MAINTENANCE',
          notes: 'E2E tenant-wide closure',
          startTime: '10:00',
          endTime: '11:00',
        },
        128,
      );
      const dateKey = tenantWideClosure.dateKey;
      // Pinned to the exact same date as the tenant-wide closure above (not a second
      // createUniqueScheduleClosure call, whose own date-retry loop could otherwise land it on a
      // different date) — the two need to genuinely overlap for this test's own assertions.
      const resourceClosure = await createScheduleClosureAt(page, dateKey, {
        reason: 'MAINTENANCE',
        notes: 'E2E resource-scoped closure',
        resourceId: resource.id,
        startTime: '10:00',
        endTime: '11:00',
      });

      try {
        await page.goto(scheduleRoute(dateKey));

        await page.getByRole('button', { name: 'Filtrar recurso' }).click();
        await page.getByRole('checkbox', { name: resource.name }).check();
        await page.getByRole('button', { name: 'Fechar' }).click();

        const tenantWideBlock = page.getByTestId(`schedule-closure-block-${tenantWideClosure.id}`);
        const resourceBlock = page.getByTestId(`schedule-closure-block-${resourceClosure.id}`);

        // The tenant-wide closure must remain visible once a resource is checked — it applies to
        // every resource regardless of what's checked in the filter, since the backend's
        // resourceId filter is exact (never both tenant-wide and resource-scoped in one response).
        await expect(tenantWideBlock).toBeVisible();
        await expect(resourceBlock).toBeVisible();

        // Resource-scoped block carries a resource-name label; the tenant-wide one doesn't (there's
        // no single resource to name). Matched by testid, not by the rendered name text
        // (docs/08-TESTING_STRATEGY.md § E2E Selector Strategy).
        await expect(resourceBlock.getByTestId('timeline-block-resource-name')).toHaveText(
          resource.name,
        );
        await expect(tenantWideBlock.getByTestId('timeline-block-resource-name')).toHaveCount(0);

        // Same time window, two overlapping same-kind blocks — laid out side-by-side (non-equal
        // left offsets), not stacked directly on top of each other.
        const tenantWideLeft = await tenantWideBlock.evaluate((el) => el.style.left);
        const resourceLeft = await resourceBlock.evaluate((el) => el.style.left);
        expect(tenantWideLeft).not.toBe(resourceLeft);
      } finally {
        await removeScheduleClosure(page, tenantWideClosure.id);
        await removeScheduleClosure(page, resourceClosure.id);
      }
    } finally {
      await deactivateResource(page, resource.id);
    }
  });

  test('both a tenant-wide opening and a resource-scoped opening on the same date render, once a resource is checked (M21-S05)', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const resource = await createResource(page, {
      type: 'ROOM',
      name: uniqueLabel('E2E Sala Plantão'),
    });

    try {
      const tenantWideOpening = await createUniqueScheduleOpening(
        page,
        { startTime: '09:00', endTime: '18:00', notes: 'E2E tenant-wide opening' },
        129,
      );
      const dateKey = tenantWideOpening.dateKey;
      // A resource-scoped opening requires the tenant-wide one to already exist for the same
      // date (docs/02-DOMAIN_MODEL.md) — pinned to it directly, not via a second
      // createUniqueScheduleOpening call (see createScheduleOpeningAt's own note).
      const resourceOpening = await createScheduleOpeningAt(page, dateKey, {
        startTime: '11:00',
        endTime: '13:00',
        resourceId: resource.id,
      });

      try {
        await page.goto(scheduleRoute(dateKey));

        const tenantWideBlock = page.getByTestId(`schedule-opening-block-${tenantWideOpening.id}`);
        const resourceBlock = page.getByTestId(`schedule-opening-block-${resourceOpening.id}`);

        // Default tenant-wide view: only the tenant-wide opening shows.
        await expect(tenantWideBlock).toBeVisible();
        await expect(resourceBlock).toHaveCount(0);

        await page.getByRole('button', { name: 'Filtrar recurso' }).click();
        await page.getByRole('checkbox', { name: resource.name }).check();
        await page.getByRole('button', { name: 'Fechar' }).click();

        // Once the resource is checked, both openings must render — the timeline previously
        // picked only the first opening returned for the date and silently dropped the rest.
        await expect(tenantWideBlock).toBeVisible();
        await expect(resourceBlock).toBeVisible();
        await expect(resourceBlock.getByTestId('timeline-block-resource-name')).toHaveText(
          resource.name,
        );
      } finally {
        // The resource-scoped opening must go first — the backend rejects removing a tenant-wide
        // opening while a resource-scoped dependent for the same date still exists
        // (BOOKING_TENANT_OPENING_HAS_RESOURCE_DEPENDENTS).
        await removeScheduleOpening(page, resourceOpening.id);
        await removeScheduleOpening(page, tenantWideOpening.id);
      }
    } finally {
      await deactivateResource(page, resource.id);
    }
  });

  test('creating a closure via the form omits resourceId when the per-action resource field is left on "Todo o negócio" (M21-S05 regression guard)', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const dateKey = nextOpenDateKey(126);
    await page.goto(scheduleRoute(dateKey));

    const requestPromise = page.waitForRequest(
      (request) => request.url().includes('/schedule/closures') && request.method() === 'POST',
    );
    const responsePromise = page.waitForResponse(
      (res) => res.url().includes('/schedule/closures') && res.request().method() === 'POST',
    );

    await page.getByRole('button', { name: 'Bloquear período' }).click();
    // Scoped to the dialog — the page-level "Bloquear período" FAB also matches an unscoped
    // getByRole('button', { name: 'Bloquear' }) via Playwright's default substring matching.
    await page.getByRole('dialog').getByRole('button', { name: 'Bloquear' }).click();

    const request = await requestPromise;
    const requestBody = request.postDataJSON() as Record<string, unknown>;
    expect(requestBody).not.toHaveProperty('resourceId');

    const response = await responsePromise;
    const created = (await response.json()) as { readonly id: string };
    await removeScheduleClosure(page, created.id);
  });

  test('creating a closure via the per-action resource field scopes it to that resource, independent of the filter menu selection (M21-S05)', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const resource = await createResource(page, {
      type: 'ROOM',
      name: uniqueLabel('E2E Sala Ação'),
    });

    try {
      const dateKey = nextOpenDateKey(127);
      await page.goto(scheduleRoute(dateKey));

      const requestPromise = page.waitForRequest(
        (request) => request.url().includes('/schedule/closures') && request.method() === 'POST',
      );
      const responsePromise = page.waitForResponse(
        (res) => res.url().includes('/schedule/closures') && res.request().method() === 'POST',
      );

      await page.getByRole('button', { name: 'Bloquear período' }).click();
      // The per-action field lives inside the sheet, decoupled from the page-level filter menu —
      // it always starts fresh at "Todo o negócio" regardless of what's checked there.
      await page.getByTestId('resource-select-field').selectOption(resource.id);
      await page.getByRole('dialog').getByRole('button', { name: 'Bloquear' }).click();

      const request = await requestPromise;
      const requestBody = request.postDataJSON() as Record<string, unknown>;
      expect(requestBody).toMatchObject({ resourceId: resource.id });

      const response = await responsePromise;
      const created = (await response.json()) as { readonly id: string };
      await removeScheduleClosure(page, created.id);
    } finally {
      await deactivateResource(page, resource.id);
    }
  });

  test('a minimum-granularity booking shows no time-range text, while a longer one still does (TD44 Story 4)', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const minimumName = uniqueLabel('min-granularity');
    const minimumBooking = await createUniqueScheduleBooking(
      page,
      {
        contactName: minimumName,
        contactEmail: uniqueTestEmail('schedule-min-granularity'),
        approved: true,
        time: '10:00',
      },
      130,
    );
    const dateKey = minimumBooking.dateKey;

    const longerName = uniqueLabel('longer-than-min');
    await createScheduleBooking(page, {
      dateKey,
      contactName: longerName,
      contactEmail: uniqueTestEmail('schedule-longer-than-min'),
      approved: true,
      time: '13:00',
      serviceIds: [SCHEDULE_LONGER_SERVICE_ID],
    });

    await page.goto(scheduleRoute(dateKey));

    const minimumBlock = page.getByRole('link', { name: minimumName });
    const longerBlock = page.getByRole('link', { name: longerName });
    await expect(minimumBlock).toBeVisible();
    await expect(longerBlock).toBeVisible();

    await expect(minimumBlock.getByTestId('timeline-block-time-range')).toHaveCount(0);
    await expect(longerBlock.getByTestId('timeline-block-time-range')).toBeVisible();
  });

  test("loading today's schedule scrolls the current-time marker into view, in both Day and Week view (TD44 Story 4)", async ({
    page,
  }) => {
    // The app computes todayKey via toISODateInTimezone(new Date(), businessHours.timezone) —
    // i.e. "today" in America/Sao_Paulo, not the test runner's own clock. Using nextOpenDateKey(0)
    // (naive local/UTC "today") diverges from that for up to 3 hours a day (00:00-03:00 UTC, when
    // UTC's calendar date is already a day ahead of São Paulo's) — CI hit exactly this window and
    // the fixture booking landed on a date the app itself doesn't consider "today," making the
    // marker assertions below meaningless. Compute "today" the same way the app does instead.
    //
    // No skip needed even if today lands on the tenant's closed weekday (Sunday): verified live
    // against a running backend+BFF that booking creation has no business-hours/closed-day check
    // at all (a POST for a closed Sunday returns 201, not a conflict), and the marker itself mounts
    // in the closed-day empty state too (ScheduleTimelineBoard's TimelineEmptyState renders
    // NowMarker regardless of hasHours) — so the assertions below hold on every day of the week.
    //
    // No booking fixture needed either: nowMarkerTopPx is derived purely from the tenant's
    // business-hours window and the current wall-clock time (schedule-scroll-to-now.ts's
    // resolveNowMarkerTopPx), and NowMarker mounts unconditionally whenever that value is defined
    // — with zero bookings on the day just as with any number of them. This tenant's single
    // degenerate LOCATION resource has no per-time-of-day capacity (see
    // approve-booking.ts's createFreshApprovedBooking), so a fixed "today, 10:00" booking with no
    // retry-on-conflict logic collided with other specs' own daysAhead:0 fixtures on the same
    // tenant — removing the unneeded booking removes the whole conflict class instead of adding a
    // retry loop to route around it.
    const tenantTodayKey = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
    }).format(new Date());

    await loginAsScheduleStaff(page);

    const dateKey = tenantTodayKey;

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(scheduleRoute(dateKey));

    // Week view first (the default on this viewport) — today's own day-card should already carry
    // a scrolled-into-view marker.
    await expect(page.getByTestId('schedule-week-view')).toBeVisible();
    await expect(page.getByTestId('schedule-now-marker')).toBeInViewport();

    // Switch to Day view — the single-timeline board's own marker should also be in view.
    await page.getByRole('combobox', { name: 'Visualização' }).click();
    await page.getByRole('option', { name: 'Dia' }).click();
    await expect(page.getByTestId('schedule-mobile-view')).toBeVisible();
    await expect(page.getByTestId('schedule-now-marker')).toBeInViewport();
  });

  test('loading a future date shows no scroll-to-now marker (TD44 Story 4, non-regression)', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const future = await createUniqueScheduleBooking(
      page,
      {
        contactName: uniqueLabel('future-no-scroll'),
        contactEmail: uniqueTestEmail('schedule-future-no-scroll'),
        approved: true,
        time: '10:00',
      },
      131,
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(scheduleRoute(future.dateKey));

    await page.getByRole('combobox', { name: 'Visualização' }).click();
    await page.getByRole('option', { name: 'Dia' }).click();
    await expect(page.getByTestId('schedule-mobile-view')).toBeVisible();
    await expect(page.getByTestId('schedule-now-marker')).toHaveCount(0);
  });

  test("a Week-view day-card shows its own header badge exactly once, not duplicated by the grid's own copy (TD44 Story 4)", async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const dateKey = nextOpenDateKey(132);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(scheduleRoute(dateKey));

    await expect(page.getByTestId('schedule-week-view')).toBeVisible();
    const card = page.getByTestId('schedule-week-day-card').nth(weekDayIndex(dateKey));
    // Exactly one badge (the day-card's own header, showing a booking count rather than the
    // redundant open/closed status) — TimelineCompactBoard's own duplicate status/count copy is
    // gone entirely.
    await expect(card.getByTestId('schedule-week-day-badge')).toHaveCount(1);
  });
});
