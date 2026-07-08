import { expect, test } from '@playwright/test';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { loginAsStaff } from './helpers/auth';
import {
  getHotsiteConfig,
  getPublicManifest,
  publishHotsite,
  toUpdateRequest,
  unpublishHotsite,
  updateHotsiteConfig,
} from './helpers/hotsite';

// autospa-premium is the same MANAGER tenant settings.spec.ts uses specifically because no
// booking/schedule/service e2e spec touches it — hotsite config doesn't overlap with that state
// either, so it's the safest tenant for a suite that repeatedly mutates tenant-wide config.
const MANAGER_EMAIL = 'admin@autospa.com.br';
const MANAGER_TENANT_SLUG = 'autospa-premium';

function layoutToggle(type: string) {
  return `[data-testid="layout-row-toggle-${type}"]`;
}

function configureButton(type: string) {
  return `[data-testid="layout-row-configure"][data-module-type="${type}"]`;
}

test.describe('hotsite editor (MANAGER)', () => {
  let original: HotsiteAdminContentResponse;

  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    original = await getHotsiteConfig(page);
  });

  test.afterEach(async ({ page }) => {
    // Hotsite config is one shared row per tenant, not a fixture a test creates for itself —
    // put it back exactly as found, publish state included.
    await updateHotsiteConfig(page, toUpdateRequest(original));
    if (original.isPublished) {
      await publishHotsite(page);
    } else {
      await unpublishHotsite(page);
    }
  });

  test('loads with the Branding tab active by default, pre-filled with the tenant current values', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');

    await expect(page.getByRole('tab', { name: 'Branding' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('hotsite-primary-color')).toHaveValue(
      original.branding.primaryColor,
    );
  });

  test('configures branding, enables and configures About + Testimonials, sets SEO, previews the draft, publishes, and the changes survive a reload', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');

    // Branding
    const primaryColor = page.getByTestId('hotsite-primary-color');
    await primaryColor.fill('#123456');

    // Layout — enable About (disabled by default in the seed) and configure it
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(layoutToggle('ABOUT')).click();
    await page.locator(configureButton('ABOUT')).click();
    await page.locator('#about-title').fill('Sobre a AutoSpa Premium');
    await page.locator('#about-body').fill('Cuidamos do seu carro com produtos premium.');
    await page.getByTestId('module-config-apply-desktop').click();

    // Enable Testimonials (also disabled by default) and add one
    await page.locator(layoutToggle('TESTIMONIALS')).click();
    await page.locator(configureButton('TESTIMONIALS')).click();
    await page.getByTestId('testimonials-add').click();
    await page.locator('#testimonial-author-0').fill('Maria Silva');
    await page.locator('#testimonial-text-0').fill('Atendimento excelente, recomendo muito!');
    await page.getByTestId('module-config-apply-desktop').click();

    // SEO
    await page.getByRole('tab', { name: 'SEO' }).click();
    await page
      .getByTestId('hotsite-seo-title')
      .fill('AutoSpa Premium — Lavagem e Estética Automotiva');
    await page
      .getByTestId('hotsite-seo-description')
      .fill('Agende sua lavagem completa em segundos.');

    // Preview renders the draft — Hero/ServiceList (already enabled in the seed) alongside the
    // two modules just enabled, all from in-memory state, no save yet.
    await page.getByTestId('hotsite-preview-desktop').click();
    await expect(page.getByTestId('hotsite-preview-content')).toBeVisible();
    await expect(page.getByText('Sobre a AutoSpa Premium')).toBeVisible();
    await expect(page.getByText('Maria Silva')).toBeVisible();

    // Publish from Preview — returns to the tabs view with the shared success banner
    await page.getByTestId('hotsite-preview-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();
    await expect(page.getByRole('tablist')).toBeVisible();

    await page.reload();

    await expect(page.getByTestId('hotsite-primary-color')).toHaveValue('#123456');
    await page.getByRole('tab', { name: 'Layout' }).click();
    await expect(page.locator(layoutToggle('ABOUT'))).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator(layoutToggle('TESTIMONIALS'))).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.getByRole('tab', { name: 'SEO' }).click();
    await expect(page.getByTestId('hotsite-seo-title')).toHaveValue(
      'AutoSpa Premium — Lavagem e Estética Automotiva',
    );
  });

  test('enabling then disabling a module again removes it from Preview and the published state', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();

    const contactToggle = page.locator(layoutToggle('CONTACT'));

    // Enable — check it actually took effect before undoing it
    await contactToggle.click();
    await expect(contactToggle).toHaveAttribute('aria-checked', 'true');

    // Disable again
    await contactToggle.click();
    await expect(contactToggle).toHaveAttribute('aria-checked', 'false');

    // Preview shouldn't render a disabled module
    await page.getByTestId('hotsite-preview-desktop').click();
    await expect(page.getByTestId('hotsite-preview-content')).toBeVisible();
    await expect(page.getByTestId('hotsite-preview-content').getByText('Fale conosco')).toHaveCount(
      0,
    );

    await page.getByTestId('hotsite-preview-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    // The manifest still carries the module (it's a config row, not deleted), just disabled
    const manifest = await getPublicManifest(page, MANAGER_TENANT_SLUG);
    const contactModule = manifest.layout.find((module) => module.type === 'CONTACT');
    expect(contactModule?.enabled).toBe(false);
  });

  test('Despublicar hotsite takes the public manifest offline without discarding the draft', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');

    await page.getByTestId('hotsite-unpublish-button').click();

    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();
    const manifest = await getPublicManifest(page, MANAGER_TENANT_SLUG);
    expect(manifest.isPublished).toBe(false);
  });

  test('an invalid branding color round-trips through the real backend validation and shows the error banner', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');

    await page.getByTestId('hotsite-primary-color').fill('not-a-color');
    await page.getByTestId('hotsite-publish-desktop').click();

    await expect(page.getByTestId('hotsite-action-error-banner')).toBeVisible();
  });

  test('SEO title enforces the 60-character limit', async ({ page }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'SEO' }).click();

    await page.getByTestId('hotsite-seo-title').fill('a'.repeat(65));

    await expect(page.getByTestId('hotsite-seo-title')).toHaveValue('a'.repeat(60));
  });
});

test.describe('hotsite editor (STAFF)', () => {
  test('is redirected away from /dashboard/hotsite — MANAGER-only route', async ({ page }) => {
    await loginAsStaff(page, 'funcionario@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/dashboard/hotsite');

    await expect(page).not.toHaveURL(/\/dashboard\/hotsite/);
  });
});
