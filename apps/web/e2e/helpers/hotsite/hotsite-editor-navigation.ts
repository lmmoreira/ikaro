import { expect, type Page } from '@playwright/test';

const DETAIL_COMMAND = '[data-testid="visual-command"][data-command="detail"]';

// /dashboard/hotsite opens in the visual editor; the tabbed editor (Branding / Layout / SEO /
// Manifesto, its Preview and the module-config drill-down) is behind "Editar em detalhes". Use
// this after a reload too — a reload always lands back in the visual editor.
export async function enterDetailedEditor(page: Page): Promise<void> {
  await page.locator(DETAIL_COMMAND).click();
  await expect(page.getByRole('tablist')).toBeVisible();
}

export async function openDetailedEditor(page: Page): Promise<void> {
  await page.goto('/dashboard/hotsite');
  await enterDetailedEditor(page);
}
