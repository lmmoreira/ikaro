import { expect, test, type Page } from '@playwright/test';
import { loginAsStaff } from '@/e2e/helpers/auth';
import {
  createScheduleClosureAt,
  createUniqueScheduleClosure,
  loginAsScheduleStaff,
  nextOpenDateKey,
  removeScheduleClosure,
  scheduleRoute,
  uniqueLabel,
} from '@/e2e/helpers/schedule';
import { createResource, deactivateResource } from '@/e2e/helpers/booking';

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
});
