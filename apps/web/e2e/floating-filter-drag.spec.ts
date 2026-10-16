import { expect, test } from '@playwright/test';
import { loginAsScheduleStaff } from '@/e2e/helpers/schedule';
import {
  AGENDA_PAGE,
  CORNER_LABEL,
  SCHEDULE_PAGE,
  chooseCornerInPopover,
  dock,
  dragPillToCorner,
  expectCorner,
  expectLocatorInsideViewport,
  expectNoOverlap,
  pill,
  popover,
  type Corner,
} from '@/e2e/helpers/floating-filter';

// M23-S50 — the floating filter (Agenda "Filtrar agenda", Horários status and resource) can be
// dragged to any of the four corners, remembers the corner per tenant and page, and opens its
// popover toward the centre. Each test starts in a fresh browser context, so the remembered corner
// starts at the default (bottom-right). The manager account is the lavacar-beloauto MANAGER, who
// sees both Horários filters.

const AGENDA_PILL = 'Filtrar agenda';
const STATUS_PILL = 'Filtrar status';
const RESOURCE_PILL = 'Filtrar recurso';

test.describe('movable floating filter (M23-S50)', () => {
  test('Agenda: dragging "Filtrar agenda" to the top-left corner opens its popover below it, inside the viewport, and survives a reload', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);
    await page.goto(AGENDA_PAGE);
    await expectCorner(page, 'bottom-right');

    await dragPillToCorner(page, AGENDA_PILL, 'top-left');

    await expectCorner(page, 'top-left');
    // A drag release is not a click: the popover stays closed.
    await expect(popover(page)).toHaveCount(0);

    await pill(page, AGENDA_PILL).click();
    await expect(popover(page)).toBeVisible();
    const pillBox = await pill(page, AGENDA_PILL).boundingBox();
    const popoverBox = await popover(page).boundingBox();
    expect(popoverBox!.y).toBeGreaterThanOrEqual(pillBox!.y + pillBox!.height);
    await expectLocatorInsideViewport(page, popover(page));

    await page.reload();
    await expectCorner(page, 'top-left');
  });

  test('Agenda: a plain click still opens and closes the popover, and nothing moves for a user who never drags', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);
    await page.goto(AGENDA_PAGE);

    await pill(page, AGENDA_PILL).click();
    await expect(popover(page)).toBeVisible();
    await expectCorner(page, 'bottom-right');
    await pill(page, AGENDA_PILL).click();
    await expect(popover(page)).toHaveCount(0);
    await expectCorner(page, 'bottom-right');
  });

  test('Agenda: choosing a corner from the "Posição" row, without dragging, moves the pill and the choice survives a reload', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);
    await page.goto(AGENDA_PAGE);

    await chooseCornerInPopover(page, AGENDA_PILL, CORNER_LABEL['top-right']);

    await expectCorner(page, 'top-right');
    await expect(
      page.getByRole('group', { name: 'Posição' }).getByRole('button', {
        name: CORNER_LABEL['top-right'],
      }),
    ).toHaveAttribute('aria-pressed', 'true');

    await page.reload();
    await expectCorner(page, 'top-right');
  });

  test('Agenda and Horários remember their own corner', async ({ page }) => {
    await loginAsScheduleStaff(page);
    await page.goto(AGENDA_PAGE);
    await chooseCornerInPopover(page, AGENDA_PILL, CORNER_LABEL['top-left']);

    await page.goto(SCHEDULE_PAGE);

    await expectCorner(page, 'bottom-right');
  });

  test('Horários: moving the filters to each corner keeps the status and resource filters visible and apart', async ({
    page,
  }) => {
    await loginAsScheduleStaff(page);
    await page.goto(SCHEDULE_PAGE);

    const corners: Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    for (const corner of corners) {
      await chooseCornerInPopover(page, STATUS_PILL, CORNER_LABEL[corner]);
      await expectCorner(page, corner);

      await expect(pill(page, STATUS_PILL)).toBeVisible();
      await expect(pill(page, RESOURCE_PILL)).toBeVisible();
      await expectNoOverlap(pill(page, STATUS_PILL), pill(page, RESOURCE_PILL));
      await expectLocatorInsideViewport(page, pill(page, STATUS_PILL));
      await expectLocatorInsideViewport(page, pill(page, RESOURCE_PILL));
      // The status filter stays nearest the corner, the resource filter further out.
      const status = (await pill(page, STATUS_PILL).boundingBox())!;
      const resource = (await pill(page, RESOURCE_PILL).boundingBox())!;
      if (corner.startsWith('top')) expect(status.y).toBeLessThan(resource.y);
      else expect(status.y).toBeGreaterThan(resource.y);
    }
  });

  test('Horários: dragging either filter moves both', async ({ page }) => {
    await loginAsScheduleStaff(page);
    await page.goto(SCHEDULE_PAGE);

    await dragPillToCorner(page, RESOURCE_PILL, 'top-right');

    await expectCorner(page, 'top-right');
    await expect(dock(page).getByRole('button', { name: STATUS_PILL, exact: true })).toBeVisible();
    await expect(
      dock(page).getByRole('button', { name: RESOURCE_PILL, exact: true }),
    ).toBeVisible();
  });

  test('desktop: the left corners start after the sidebar and the top corners sit below the topbar', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsScheduleStaff(page);
    await page.goto(AGENDA_PAGE);
    const sidebar = (await page.locator('aside').first().boundingBox())!;
    const topbar = (await page.locator('header').first().boundingBox())!;

    await chooseCornerInPopover(page, AGENDA_PILL, CORNER_LABEL['bottom-left']);
    await expectCorner(page, 'bottom-left');
    expect((await pill(page, AGENDA_PILL).boundingBox())!.x).toBeGreaterThanOrEqual(
      sidebar.x + sidebar.width,
    );

    await chooseCornerInPopover(page, AGENDA_PILL, CORNER_LABEL['top-left']);
    await expectCorner(page, 'top-left');
    const topLeft = (await pill(page, AGENDA_PILL).boundingBox())!;
    expect(topLeft.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
    expect(topLeft.y).toBeGreaterThanOrEqual(topbar.y + topbar.height);

    await chooseCornerInPopover(page, AGENDA_PILL, CORNER_LABEL['top-right']);
    await expectCorner(page, 'top-right');
    expect((await pill(page, AGENDA_PILL).boundingBox())!.y).toBeGreaterThanOrEqual(
      topbar.y + topbar.height,
    );
  });

  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('the bottom corners clear the bottom navigation and the top corners clear the topbar', async ({
      page,
    }) => {
      await loginAsScheduleStaff(page);
      await page.goto(AGENDA_PAGE);
      const bottomNav = page.locator('nav.fixed.inset-x-0.bottom-0');
      await expect(bottomNav).toBeVisible();
      const navBox = (await bottomNav.boundingBox())!;
      const topbar = (await page.locator('header').first().boundingBox())!;

      for (const corner of ['bottom-left', 'bottom-right'] as const) {
        await chooseCornerInPopover(page, AGENDA_PILL, CORNER_LABEL[corner]);
        await expectCorner(page, corner);
        await page.getByRole('button', { name: 'Fechar', exact: true }).click();
        const box = (await pill(page, AGENDA_PILL).boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(navBox.y);
      }

      for (const corner of ['top-left', 'top-right'] as const) {
        await chooseCornerInPopover(page, AGENDA_PILL, CORNER_LABEL[corner]);
        await expectCorner(page, corner);
        await page.getByRole('button', { name: 'Fechar', exact: true }).click();
        const box = (await pill(page, AGENDA_PILL).boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(topbar.y + topbar.height);
      }
    });
  });
});
