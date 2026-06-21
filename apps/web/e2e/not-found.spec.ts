import { test, expect } from '@playwright/test';

// TD02-S09 — app/not-found.tsx became an async server component (next-intl's getTranslations)
// to localize copy, which made it untestable with Vitest's render() (same category as
// page.tsx/layout.tsx — see CLAUDE.md's testing rules). Covered here by E2E instead.

test.describe('Global not-found page', () => {
  test('shows the generic tenant-not-found copy for a nonexistent slug', async ({ page }) => {
    await page.goto('/this-tenant-does-not-exist-e2e-test');

    // No manifest resolves for a nonexistent slug, so locale falls back to pt-BR.
    await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
    await expect(page.locator('[data-testid="not-found-heading"]')).toHaveText(
      'Tenant não encontrado',
    );
    await expect(page.locator('[data-testid="not-found-description"]')).toHaveText(
      'O tenant que você está procurando não existe ou foi removido.',
    );

    const backLink = page.locator('[data-testid="not-found-back-link"]');
    await expect(backLink).toHaveText('Voltar para o Ikaro');
    await expect(backLink).toHaveAttribute('href', /^https?:\/\//);
  });

  test('also triggers from a nested route under a nonexistent slug', async ({ page }) => {
    await page.goto('/this-tenant-does-not-exist-e2e-test/booking');

    await expect(page.locator('[data-testid="not-found-heading"]')).toBeVisible();
  });
});
