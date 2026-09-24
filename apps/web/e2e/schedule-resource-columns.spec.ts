import { expect, test, type Page } from '@playwright/test';
import { loginAsStaff, uniqueTestEmail } from '@/e2e/helpers/auth';
import {
  createScheduleBooking,
  createScheduleClosureAt,
  createUniqueScheduleClosure,
  loginAsScheduleStaff,
  nextOpenDateKey,
  removeScheduleClosure,
  scheduleRoute,
  uniqueLabel,
} from '@/e2e/helpers/schedule';
import { createResource, deactivateResource } from '@/e2e/helpers/booking';
import { createService, deactivateService, makeUniqueServiceName } from '@/e2e/helpers/services';
import { BFF_URL, WEB_INTERNAL_KEY } from '@/e2e/helpers/auth/shared';

// funcionario@lavacar.com.br is the genuine STAFF-role fixture account for this same tenant
// (admin@lavacar.com.br, behind loginAsScheduleStaff, is MANAGER — see
// e2e/helpers/auth/staff-login.ts's own seed-email comment).
const STAFF_ROLE_EMAIL = 'funcionario@lavacar.com.br';
const SCHEDULE_TENANT_SLUG = 'lavacar-beloauto';

// Day view only — the columns board never renders in Week view (M22-S06's own resolved design:
// Week view stays completely untouched by this feature, see plan/M22-MULTIVERTICAL-SERVICE-
// AVAILABILITY.md's M22-S06 entry). Force it via the view-mode select rather than a mobile
// viewport, matching schedule.spec.ts's own "switch to day view" pattern.
async function switchToDayView(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: 'Visualização' }).click();
  await page.getByRole('option', { name: 'Dia' }).click();
}

test.describe('schedule resource columns board (M22-S06)', () => {
  test('manager who checks two resources sees two columns, each isolated to its own resource-scoped block, and can click one open', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const resourceA = await createResource(page, { type: 'ROOM', name: uniqueLabel('E2E Sala A') });
    const resourceB = await createResource(page, {
      type: 'EQUIPMENT',
      name: uniqueLabel('E2E Equip B'),
    });

    try {
      const closureA = await createUniqueScheduleClosure(
        page,
        { reason: 'MAINTENANCE', notes: 'E2E column A', resourceId: resourceA.id },
        140,
      );
      const dateKey = closureA.dateKey;
      const closureB = await createScheduleClosureAt(page, dateKey, {
        reason: 'MAINTENANCE',
        notes: 'E2E column B',
        resourceId: resourceB.id,
      });

      try {
        await page.goto(scheduleRoute(dateKey));
        await switchToDayView(page);

        await expect(page.getByTestId('schedule-resource-columns-board')).toHaveCount(0);

        await page.getByRole('button', { name: 'Filtrar recurso' }).click();
        await page.getByRole('checkbox', { name: resourceA.name }).check();
        await page.getByRole('checkbox', { name: resourceB.name }).check();
        await page.getByRole('button', { name: 'Fechar' }).click();

        await expect(page.getByTestId('schedule-resource-columns-board')).toBeVisible();
        const columns = page.getByTestId('schedule-resource-column');
        await expect(columns).toHaveCount(2);

        const columnA = columns.filter({ hasText: resourceA.name });
        const columnB = columns.filter({ hasText: resourceB.name });

        // Each column shows only its own resource's block — not the other resource's.
        await expect(columnA.getByTestId(`schedule-closure-block-${closureA.id}`)).toBeVisible();
        await expect(columnA.getByTestId(`schedule-closure-block-${closureB.id}`)).toHaveCount(0);
        await expect(columnB.getByTestId(`schedule-closure-block-${closureB.id}`)).toBeVisible();
        await expect(columnB.getByTestId(`schedule-closure-block-${closureA.id}`)).toHaveCount(0);

        // Clicking a block still opens its own detail dialog, same as the single timeline.
        await columnA.getByTestId(`schedule-closure-block-${closureA.id}`).click();
        await expect(page.getByRole('dialog')).toBeVisible();
        // BookingActionSheetShell renders two "Cancelar" buttons (a header close affordance and
        // the footer action button) — .last() targets the footer one, matching the primary
        // cancel action a user would actually click.
        await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).last().click();
      } finally {
        await removeScheduleClosure(page, closureA.id);
        await removeScheduleClosure(page, closureB.id);
      }
    } finally {
      await deactivateResource(page, resourceA.id);
      await deactivateResource(page, resourceB.id);
    }
  });

  test('manager checks a resource, sees its own booking block in the column, and clicking it opens the booking detail', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const resource = await createResource(page, {
      type: 'ROOM',
      name: uniqueLabel('E2E Sala Book'),
    });
    const service = await createService(page, {
      name: makeUniqueServiceName('e2e-col-booking'),
      priceAmount: 100,
      durationMinutes: 30,
      loyaltyPointsValue: 5,
      isActive: true,
    });

    try {
      // Binds the service to exactly this one resource — AUTO_FUNGIBLE_POOL with a single-id pool
      // deterministically assigns that resource, unlike AUTO_ANY (which could pick any other
      // active resource of the same type in the tenant).
      const resourceReqResponse = await page.request.patch(
        `${BFF_URL}/services/${service.serviceId}/resource-requirements`,
        {
          data: {
            resourceRequirements: [
              { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', resourcePoolIds: [resource.id] },
            ],
          },
          headers: { 'X-Web-Internal-Key': WEB_INTERNAL_KEY! },
        },
      );
      expect(resourceReqResponse.ok()).toBe(true);

      const contactName = uniqueLabel('E2E Booking Column');
      const dateKey = nextOpenDateKey(150);
      const booking = await createScheduleBooking(page, {
        dateKey,
        contactName,
        contactEmail: uniqueTestEmail('schedule-resource-column'),
        approved: true,
        time: '11:00',
        serviceIds: [service.serviceId],
      });

      // Booking created above isn't explicitly removed — matches this suite's existing precedent
      // (schedule.spec.ts's own booking-detail tests leave their fixture bookings in place too);
      // only the resource/service fixtures below need explicit teardown.
      await page.goto(scheduleRoute(dateKey));
      await switchToDayView(page);

      await page.getByRole('button', { name: 'Filtrar recurso' }).click();
      await page.getByRole('checkbox', { name: resource.name }).check();
      await page.getByRole('button', { name: 'Fechar' }).click();

      const column = page
        .getByTestId('schedule-resource-column')
        .filter({ hasText: resource.name });
      const bookingLink = column.getByRole('link', { name: contactName });
      await expect(bookingLink).toHaveAttribute(
        'href',
        new RegExp(`/dashboard/bookings/${booking.bookingId}\\?returnTo=`),
      );

      await bookingLink.click();
      await expect(page).toHaveURL(new RegExp(`/dashboard/bookings/${booking.bookingId}`));
    } finally {
      await deactivateService(page, service.serviceId);
      await deactivateResource(page, resource.id);
    }
  });

  test('unchecking every resource reverts to the single timeline, and switching to week view hides the columns board entirely', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    const resource = await createResource(page, { type: 'ROOM', name: uniqueLabel('E2E Sala C') });

    try {
      const closure = await createUniqueScheduleClosure(
        page,
        { reason: 'MAINTENANCE', notes: 'E2E week-view isolation', resourceId: resource.id },
        141,
      );
      const dateKey = closure.dateKey;

      try {
        await page.goto(scheduleRoute(dateKey));
        await switchToDayView(page);

        await page.getByRole('button', { name: 'Filtrar recurso' }).click();
        await page.getByRole('checkbox', { name: resource.name }).check();
        await page.getByRole('button', { name: 'Fechar' }).click();

        await expect(page.getByTestId('schedule-resource-columns-board')).toBeVisible();

        // Week view stays completely untouched — no columns board there, resource checked or not.
        await page.getByRole('combobox', { name: 'Visualização' }).click();
        await page.getByRole('option', { name: 'Semana' }).click();
        await expect(page.getByTestId('schedule-resource-columns-board')).toHaveCount(0);
        await expect(page.getByTestId('schedule-week-view')).toBeVisible();

        await switchToDayView(page);
        await expect(page.getByTestId('schedule-resource-columns-board')).toBeVisible();

        await page.getByRole('button', { name: 'Filtrar recurso' }).click();
        await page.getByRole('checkbox', { name: resource.name }).uncheck();
        await page.getByRole('button', { name: 'Fechar' }).click();

        await expect(page.getByTestId('schedule-resource-columns-board')).toHaveCount(0);
        await expect(page.getByTestId('schedule-mobile-view')).toBeVisible();
      } finally {
        await removeScheduleClosure(page, closure.id);
      }
    } finally {
      await deactivateResource(page, resource.id);
    }
  });

  test('staff never sees the resource filter or the columns board', async ({ page }) => {
    await loginAsStaff(page, STAFF_ROLE_EMAIL, SCHEDULE_TENANT_SLUG);
    await page.goto(scheduleRoute(nextOpenDateKey(142)));
    await expect(page.getByRole('button', { name: 'Filtrar recurso' })).toHaveCount(0);
    await expect(page.getByTestId('schedule-resource-columns-board')).toHaveCount(0);
  });

  test('manager cannot check a 7th resource past the cap of 6, and unchecking one frees a slot (TD44)', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);

    // Created sequentially, inside the try, appending each as it succeeds — a mid-batch failure
    // still leaves every already-created resource tracked for the finally block's cleanup.
    const resources: Awaited<ReturnType<typeof createResource>>[] = [];
    try {
      for (let i = 0; i < 7; i++) {
        resources.push(
          await createResource(page, { type: 'EQUIPMENT', name: uniqueLabel(`E2E Cap ${i}`) }),
        );
      }

      await page.goto(scheduleRoute(nextOpenDateKey(143)));
      await switchToDayView(page);
      await page.getByRole('button', { name: 'Filtrar recurso' }).click();

      for (const resource of resources.slice(0, 6)) {
        await page.getByRole('checkbox', { name: resource.name }).check();
      }

      const seventhCheckbox = page.getByRole('checkbox', { name: resources[6].name });
      await expect(seventhCheckbox).toBeDisabled();
      await expect(page.getByTestId('resource-filter-max-reached')).toBeVisible();

      await page.getByRole('checkbox', { name: resources[0].name }).uncheck();
      await expect(page.getByTestId('resource-filter-max-reached')).toHaveCount(0);
      await expect(seventhCheckbox).toBeEnabled();
      await seventhCheckbox.check();
      await expect(seventhCheckbox).toBeChecked();
    } finally {
      await Promise.all(resources.map((resource) => deactivateResource(page, resource.id)));
    }
  });
});
