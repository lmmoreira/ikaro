import { expect, type Locator, type Page } from '@playwright/test';

// M23-S50: the floating filter can be dragged to any of the four corners of the screen.
export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const AGENDA_PAGE = '/dashboard/bookings';
export const SCHEDULE_PAGE = '/dashboard/schedule';

export function dock(page: Page): Locator {
  return page.getByTestId('floating-filter-dock');
}

export function pill(page: Page, name: string): Locator {
  return page.getByRole('button', { name, exact: true });
}

export function popover(page: Page): Locator {
  return page.getByTestId('floating-filter-popover');
}

export async function expectCorner(page: Page, corner: Corner): Promise<void> {
  await expect(dock(page)).toHaveAttribute('data-corner', corner);
}

// Drags the pill's centre to the middle of a quadrant with real mouse events, past the click
// threshold, and releases there.
export async function dragPillToCorner(
  page: Page,
  pillName: string,
  corner: Corner,
): Promise<void> {
  const box = await pill(page, pillName).boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('pill or viewport has no geometry');
  const target = {
    x: corner.endsWith('left') ? viewport.width * 0.15 : viewport.width * 0.85,
    y: corner.startsWith('top') ? viewport.height * 0.15 : viewport.height * 0.85,
  };
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
}

export async function chooseCornerInPopover(
  page: Page,
  pillName: string,
  cornerLabel: string,
): Promise<void> {
  // The popover stays open after a corner is picked, so only open it when it is closed.
  if (!(await popover(page).isVisible())) await pill(page, pillName).click();
  await page
    .getByRole('group', { name: 'Posição' })
    .getByRole('button', { name: cornerLabel })
    .click();
}

export const CORNER_LABEL: Readonly<Record<Corner, string>> = {
  'top-left': 'Canto superior esquerdo',
  'top-right': 'Canto superior direito',
  'bottom-left': 'Canto inferior esquerdo',
  'bottom-right': 'Canto inferior direito',
};

// The popover has to sit fully inside the viewport, whichever corner the dock is in.
export async function expectLocatorInsideViewport(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('locator or viewport has no geometry');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
}

export async function expectNoOverlap(first: Locator, second: Locator): Promise<void> {
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  if (!a || !b) throw new Error('a pill has no geometry');
  const overlaps =
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  expect(overlaps).toBe(false);
}
