import { deflateSync } from 'node:zlib';
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
import {
  getTenantSettings,
  toUpdateRequest as toSettingsUpdateRequest,
  updateTenantSettings,
} from './helpers/platform';

// autospa-premium is the same MANAGER tenant settings.spec.ts uses specifically because no
// booking/schedule/service e2e spec touches it — hotsite config doesn't overlap with that state
// either, so it's the safest tenant for a suite that repeatedly mutates tenant-wide config.
//
// The 2 maxBookingAdvanceDays-dependent tests below mutate real tenant *settings* on this same
// tenant, which settings.spec.ts also mutates — page.route()-mocking the manifest response was
// tried instead (to avoid touching real settings at all) and doesn't work: app/[slug]/booking/
// page.tsx is a Server Component, so fetchManifest() runs on the Next.js server and never
// reaches the browser's network stack that page.route() intercepts (confirmed 2026-07-28). A
// real settings mutation is therefore the only thing that actually works here. Under
// fullyParallel this can theoretically race settings.spec.ts's own concurrent write locally —
// CI's workers: 1 makes that impossible in the gate that actually matters; treat a local full-
// suite run hitting it as a false alarm, not evidence of a real bug, and re-run serially
// (--workers=1) to confirm before treating it as one.
const MANAGER_EMAIL = 'admin@autospa.com.br';
const MANAGER_TENANT_SLUG = 'autospa-premium';

function layoutToggle(type: string) {
  return `[data-testid="layout-row-toggle-${type}"]`;
}

function configureButton(type: string) {
  return `[data-testid="layout-row-configure"][data-module-type="${type}"]`;
}

function crc32(buf: Buffer): number {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

// A real, decodable, solid-color PNG at the given size — unlike a plain-text fake buffer, the
// browser can actually render this as an <img> (a browser-undecodable blob renders at zero
// dimensions, which Playwright reports as "hidden" even though the element/attributes exist).
// Needs real dimensions, not just a 1x1 pixel: compressImage()'s crop-to-ratio guarantee
// (branding 1:1, seo-og-image 1200/630 — M18-S03) now rejects sources too small to represent the
// required ratio, and a 1x1 source can't represent 1200/630 in whole pixels.
function makeSolidPng(width: number, height: number): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor
  const ihdr = pngChunk('IHDR', ihdrData);

  const row = Buffer.alloc(1 + width * 3); // leading filter-type byte (0) + RGB triplets
  for (let x = 0; x < width; x++) row.fill(200, 1 + x * 3, 1 + x * 3 + 3);
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const idat = pngChunk('IDAT', deflateSync(raw));

  const iend = pngChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdr, idat, iend]);
}

// 120x63 — exactly the 1200/630 (seo-og-image) ratio scaled down by 10x, and large enough to also
// crop cleanly to 1:1 (branding) with no rounding-tolerance concerns either way.
const CROPPABLE_PNG_BUFFER = makeSolidPng(120, 63);

// 1604x494 (≈3.25:1) — the actual reference banner dimensions from /story-discovery, not an
// arbitrary ratio. The 'hero' purpose applies no crop ratio, but M18-S04's minimum-stored-height
// guard (450px, checked post-compression) still applies — this exact ratio is the one the 450px
// threshold was derived against (compresses to ≈493px, clearing the floor with only a small
// margin), so using it here actually exercises that coupling instead of a ratio far from it.
const HERO_PNG_BUFFER = makeSolidPng(1604, 494);

// .serial: every test here mutates autospa-premium's shared hotsite-config/settings rows and
// restores them in afterEach — fullyParallel doesn't stop Playwright from running same-describe
// tests in different workers, so without .serial these race each other for real (confirmed:
// adding more mutating tests here broke an unrelated pre-existing test in this same block via a
// mid-test overwrite, 2026-07-28).
test.describe.serial('hotsite editor (MANAGER)', () => {
  let original: HotsiteAdminContentResponse;
  let originalSettings: Awaited<ReturnType<typeof getTenantSettings>>;

  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    original = await getHotsiteConfig(page);
    originalSettings = await getTenantSettings(page);
  });

  test.afterEach(async ({ page }) => {
    // Hotsite config and tenant settings are each one shared row per tenant, not a fixture a
    // test creates for itself — put both back exactly as found, publish state included.
    // afterEach (not a per-test try/finally) is what makes this survive a test-level timeout:
    // Playwright always runs afterEach hooks, but a test aborted by its own timeout can skip
    // straight past an in-body finally block (confirmed 2026-07-28 — a timed-out settings
    // mutation left maxBookingAdvanceDays stuck at 5 in the shared dev DB until fixed by hand).
    await updateHotsiteConfig(page, toUpdateRequest(original));
    if (original.isPublished) {
      await publishHotsite(page);
    } else {
      await unpublishHotsite(page);
    }
    await updateTenantSettings(page, toSettingsUpdateRequest(originalSettings.settings));
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
    const previewContent = page.getByTestId('hotsite-preview-content');
    await expect(previewContent).toBeVisible();
    // #about / #testimonials are stable anchor ids each module already renders (used as CTA
    // scroll targets), not test-only additions — locating by id keeps this off getByText/
    // getByLabel per this repo's E2E-1 convention while still asserting the actual content.
    await expect(previewContent.locator('#about')).toContainText('Sobre a AutoSpa Premium');
    await expect(previewContent.locator('#testimonials')).toContainText('Maria Silva');

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

    // Preview shouldn't render a disabled module — #contact is the module's own stable anchor
    // id (a CTA scroll target, not a test-only addition), absent entirely when disabled since
    // buildHotsiteModuleRenderPlan skips disabled modules.
    await page.getByTestId('hotsite-preview-desktop').click();
    const previewContent = page.getByTestId('hotsite-preview-content');
    await expect(previewContent).toBeVisible();
    await expect(previewContent.locator('#contact')).toHaveCount(0);

    await page.getByTestId('hotsite-preview-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    // The manifest still carries the module (it's a config row, not deleted), just disabled
    const manifest = await getPublicManifest(page, MANAGER_TENANT_SLUG);
    const contactModule = manifest.layout.find((module) => module.type === 'CONTACT');
    expect(contactModule?.enabled).toBe(false);
  });

  // M18-S08 — Preview reachable from inside a module's own config screen, not just the main tabs
  // view. Back returns to that same panel with the in-progress edit intact (not reset to the
  // last-Aplicar'd value, not sent to the tabs view).
  test('Module config Preview: shows the in-progress edit without Aplicar, and Back returns to the same panel with the edit intact (M18-S08)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('HERO')).click();

    await page.locator('#hero-title').fill('Título em progresso');

    // Preview from module-config, without clicking Aplicar first.
    await page.getByTestId('module-config-preview-desktop').click();
    const previewContent = page.getByTestId('hotsite-preview-content');
    await expect(previewContent).toBeVisible();
    await expect(previewContent.locator('h1')).toContainText('Título em progresso');

    // Back returns to the same module-config panel — not reset, not sent to the tabs view.
    await page.getByTestId('topbar-back-button').click();
    await expect(page.locator('#hero-title')).toHaveValue('Título em progresso');

    await page.getByTestId('module-config-apply-desktop').click();
    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('HERO')).click();
    await expect(page.locator('#hero-title')).toHaveValue('Título em progresso');
  });

  // Proves the merged-submit path in HotsiteEditor's handlePublish(contentOverride), not just the
  // visual preview above — Publish reachable directly from module-config-preview, skipping Aplicar
  // entirely, still saves the in-progress edit.
  test('Module config Preview: Publish directly from that preview (skipping Aplicar) persists the edit after reload (M18-S08)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('HERO')).click();

    await page.locator('#hero-title').fill('Publicado direto do preview');
    await page.getByTestId('module-config-preview-desktop').click();

    await page.getByTestId('hotsite-preview-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();
    await expect(page.getByRole('tablist')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('HERO')).click();
    await expect(page.locator('#hero-title')).toHaveValue('Publicado direto do preview');
  });

  // M18-S08 — Cancelar/topbar-back only prompts when there's an actual unapplied edit to lose.
  test('Module config discard-confirm: Cancelar after an edit prompts before discarding; "Continuar editando" keeps it, "Descartar alterações" discards it (M18-S08)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('HERO')).click();

    await page.locator('#hero-title').fill('Vai ser descartado');
    await page.getByTestId('module-config-cancel-desktop').click();

    // "Continuar editando" closes the dialog and keeps the edit on the same panel.
    await expect(page.getByTestId('module-config-discard-confirm')).toBeVisible();
    await page.getByRole('button', { name: 'Continuar editando' }).click();
    await expect(page.getByTestId('module-config-discard-confirm')).toBeHidden();
    await expect(page.locator('#hero-title')).toHaveValue('Vai ser descartado');

    // Cancelar again, this time confirming the discard.
    await page.getByTestId('module-config-cancel-desktop').click();
    await page.getByTestId('module-config-discard-confirm').click();
    await expect(page.getByRole('tablist')).toBeVisible();

    // Re-opening Hero's config shows the original, unedited value — never applied or saved.
    await page.locator(configureButton('HERO')).click();
    await expect(page.locator('#hero-title')).not.toHaveValue('Vai ser descartado');
  });

  // M18-S08 — a plain link to the real, currently-published public hotsite, from the main tabs
  // view only. Opens in a new tab so the in-progress draft in the editor is never navigated away
  // from.
  test('"Visitar site" opens the public hotsite in a new tab (M18-S08)', async ({
    page,
    context,
  }) => {
    await page.goto('/dashboard/hotsite');

    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByTestId('hotsite-view-live-site-desktop').click(),
    ]);
    await newPage.waitForLoadState();

    expect(newPage.url()).toContain(`/${MANAGER_TENANT_SLUG}`);
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

  // M18-S03 — seo.ogImageUrl is a dedicated share-image field, decoupled from branding.logoUrl.
  test('SEO tab: uploading a share image, publishing, and reloading persists it, and the public hotsite resolves it as og:image (M18-S03)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'SEO' }).click();

    await page.getByTestId('single-image-upload-input').setInputFiles({
      name: 'share.png',
      mimeType: 'image/png',
      buffer: CROPPABLE_PNG_BUFFER,
    });
    await expect(page.getByTestId('single-image-upload-preview')).toBeVisible();

    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'SEO' }).click();
    await expect(page.getByTestId('single-image-upload-preview')).toBeVisible();

    await page.goto(`/${MANAGER_TENANT_SLUG}`);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      'content',
      /^https?:\/\//,
    );
  });

  // M18-S03 — branding.logoUrl now renders in the topbar, footer, and browser tab favicon (in
  // addition to the pre-existing login-page badge), with an initial-letter fallback when unset.
  test('Branding tab: uploading a logo, publishing, and reloading renders it in the public hotsite topbar, footer, and favicon (M18-S03)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');

    await page.getByTestId('single-image-upload-input').setInputFiles({
      name: 'logo.png',
      mimeType: 'image/png',
      buffer: CROPPABLE_PNG_BUFFER,
    });
    await expect(page.getByTestId('single-image-upload-preview')).toBeVisible();

    // FOOTER isn't in any of the seed layouts (HERO/SERVICE_LIST/BOOKING_CTA only) — enable it
    // so <footer> actually renders on the public page for the assertion below. HotsiteEditor
    // keeps one shared `draft` across tabs, so the logo just uploaded on Branding survives the
    // switch to Layout and back.
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(layoutToggle('FOOTER')).click();

    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.goto(`/${MANAGER_TENANT_SLUG}`);
    await expect(page.locator('[data-testid="hotsite-auth-bar"] img')).toBeVisible();
    await expect(page.locator('footer img')).toBeVisible();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /.+/);
  });

  // M18-S04 — hero background image gets a tenant-adjustable focal point (object-position) and
  // an aspect-ratio-driven mobile crop, replacing the old viewport-relative min-h-screen height.
  test('Hero panel: uploading a background image and setting the focal point persist after Publish and reload, and the live page applies the object-position (M18-S04)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('HERO')).click();

    await page.getByTestId('single-image-upload-input').setInputFiles({
      name: 'hero-banner.png',
      mimeType: 'image/png',
      buffer: HERO_PNG_BUFFER,
    });
    await expect(page.getByTestId('single-image-upload-preview')).toBeVisible();

    await page.locator('[data-testid="hero-background-image-position-right"]').click();
    await page.getByTestId('module-config-apply-desktop').click();

    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('HERO')).click();
    await expect(page.getByTestId('single-image-upload-preview')).toBeVisible();
    await expect(
      page.locator('[data-testid="hero-background-image-position-right"]'),
    ).toHaveAttribute('aria-checked', 'true');

    await page.goto(`/${MANAGER_TENANT_SLUG}`);
    const heroImage = page.locator('[data-variant="centered"] img').first();
    await expect(heroImage).toBeVisible();
    // 'right' -> CSS object-position: right center, which the browser resolves to percentages.
    await expect(heroImage).toHaveCSS('object-position', '100% 50%');

    // Regression check for the actual crop bug this story fixes: before M18-S04, the centered
    // variant's section used min-h-screen, forcing its height to the full device viewport height
    // on mobile regardless of content — the root cause of the reported "gets really cut" crop.
    // The replacement (min-h-[42.86vw], a floor) must keep the section well short of that on a
    // real mobile viewport.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const heroSection = page.locator('[data-variant="centered"]');
    await expect(heroSection.locator('img')).toBeVisible();
    const box = await heroSection.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(700);
  });

  test('Hero panel: setting contentPositionX/contentPositionY on the centered variant persists after Publish and reload, and the live page applies the expected alignment (M18-S05)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('HERO')).click();

    // Explicit, not assumed from seed state — the X picker only renders for 'centered' (M18-S05
    // review finding, PR #295).
    await page.locator('[data-testid="hero-variant-centered"]').click();
    await page.locator('[data-testid="hero-content-position-x-right"]').click();
    await page.locator('[data-testid="hero-content-position-y-top"]').click();
    await page.getByTestId('module-config-apply-desktop').click();

    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('HERO')).click();
    await expect(page.locator('[data-testid="hero-content-position-x-right"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('[data-testid="hero-content-position-y-top"]')).toHaveAttribute(
      'aria-checked',
      'true',
    );

    await page.goto(`/${MANAGER_TENANT_SLUG}`);
    const heroSection = page.locator('[data-variant="centered"]');
    // justify-content lives on the stage div (max-w-7xl mx-auto), not the section itself — see
    // the "Fix: left/right anchor..." follow-up in this same story.
    const heroStage = heroSection.locator('> div').first();
    await expect(heroStage).toHaveCSS('justify-content', 'flex-end');
    await expect(heroStage).toHaveCSS('max-width', '1280px');
    await expect(heroSection).toHaveCSS('align-items', 'flex-start');
  });

  test('Booking CTA panel: setting contentPositionX/contentPositionY on the centered variant persists after Publish and reload, and the live page applies the expected alignment (M18-S05)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();

    // BOOKING_CTA is absent from the autospa-premium seed layout — materializeLayout() gives it
    // a disabled row with default data, same as the M18-S01 Calendar-section test above.
    await page.locator(layoutToggle('BOOKING_CTA')).click();
    await page.locator(configureButton('BOOKING_CTA')).click();
    await page.locator('#booking-cta-title').fill('Agende seu horário');
    await page.locator('#booking-cta-cta-label').fill('Agendar agora');

    await page.locator('[data-testid="booking-cta-content-position-x-right"]').click();
    await page.locator('[data-testid="booking-cta-content-position-y-top"]').click();
    await page.getByTestId('module-config-apply-desktop').click();

    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('BOOKING_CTA')).click();
    await expect(
      page.locator('[data-testid="booking-cta-content-position-x-right"]'),
    ).toHaveAttribute('aria-checked', 'true');
    await expect(
      page.locator('[data-testid="booking-cta-content-position-y-top"]'),
    ).toHaveAttribute('aria-checked', 'true');

    await page.goto(`/${MANAGER_TENANT_SLUG}`);
    const bookingCtaSection = page.locator('section#booking-form');
    // justify-content lives on the stage div (max-w-7xl mx-auto), not the section itself — same
    // structure as HeroModule, see the "Fix: left/right anchor..." follow-up in this same story.
    const bookingCtaStage = bookingCtaSection.locator('> div').first();
    await expect(bookingCtaStage).toHaveCSS('justify-content', 'flex-end');
    await expect(bookingCtaStage).toHaveCSS('max-width', '1280px');
    await expect(bookingCtaSection).toHaveCSS('align-items', 'flex-start');
  });

  test('Booking CTA panel: uploading a background image and setting the focal point persist after Publish and reload, and the live page applies the object-position (M18-S05)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();

    await page.locator(layoutToggle('BOOKING_CTA')).click();
    await page.locator(configureButton('BOOKING_CTA')).click();
    await page.locator('#booking-cta-title').fill('Agende seu horário');
    await page.locator('#booking-cta-cta-label').fill('Agendar agora');

    await page.getByTestId('single-image-upload-input').setInputFiles({
      name: 'booking-cta-banner.png',
      mimeType: 'image/png',
      buffer: HERO_PNG_BUFFER,
    });
    await expect(page.getByTestId('single-image-upload-preview')).toBeVisible();

    await page.locator('[data-testid="booking-cta-background-image-position-right"]').click();
    await page.getByTestId('module-config-apply-desktop').click();

    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('BOOKING_CTA')).click();
    await expect(page.getByTestId('single-image-upload-preview')).toBeVisible();
    await expect(
      page.locator('[data-testid="booking-cta-background-image-position-right"]'),
    ).toHaveAttribute('aria-checked', 'true');

    await page.goto(`/${MANAGER_TENANT_SLUG}`);
    const bookingCtaImage = page.locator('section#booking-form img').first();
    await expect(bookingCtaImage).toBeVisible();
    // 'right' -> CSS object-position: right center, which the browser resolves to percentages.
    await expect(bookingCtaImage).toHaveCSS('object-position', '100% 50%');

    // Regression check mirroring Hero's M18-S04 test: before this story's Part 9, this section
    // used min-h-[40vh], the same category of viewport-height-relative crop bug Hero had before
    // M18-S04 — the section must stay well short of a full-viewport-height mobile crop.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const bookingCtaSectionMobile = page.locator('section#booking-form');
    await expect(bookingCtaSectionMobile.locator('img')).toBeVisible();
    const box = await bookingCtaSectionMobile.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeLessThan(700);
  });

  // M18-S06 — Mosaico only differs from Grade once tiles are allowed unequal heights; this proves
  // the real, end-to-end effect (actual browser decode → real width/height → rendered box), not
  // just that the flex-basis tile class is present (already covered at the unit level).
  test('Gallery panel: two photos of different aspect ratios render at different heights under Mosaico, after Publish and reload (M18-S06)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();

    // GALLERY is absent from the autospa-premium seed layout — materializeLayout() gives it a
    // disabled row with default data, same as ABOUT/TESTIMONIALS/BOOKING_CTA above.
    await page.locator(layoutToggle('GALLERY')).click();
    await page.locator(configureButton('GALLERY')).click();

    // A tall (1:3) and a wide (3:1) photo — deliberately extreme so the height difference can't
    // be mistaken for layout noise.
    await page.getByTestId('gallery-upload-input').setInputFiles({
      name: 'tall.png',
      mimeType: 'image/png',
      buffer: makeSolidPng(100, 300),
    });
    await expect(page.getByTestId('gallery-image')).toHaveCount(1);
    await page.getByTestId('gallery-upload-input').setInputFiles({
      name: 'wide.png',
      mimeType: 'image/png',
      buffer: makeSolidPng(300, 100),
    });
    await expect(page.getByTestId('gallery-image')).toHaveCount(2);

    await page.getByTestId('gallery-layout-masonry').click();
    await page.getByTestId('module-config-apply-desktop').click();

    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.goto(`/${MANAGER_TENANT_SLUG}`);
    const tiles = page.locator('section#gallery a[data-gallery-url]');
    await expect(tiles).toHaveCount(2);
    const tallBox = await tiles.nth(0).boundingBox();
    const wideBox = await tiles.nth(1).boundingBox();
    expect(tallBox).not.toBeNull();
    expect(wideBox).not.toBeNull();
    // Same tile width (both at basis-[calc(50%-0.5rem)], 2 images) — a real 9:1 height ratio is
    // expected; 2x is a generous floor against layout/rounding noise, not a tight tolerance.
    expect(tallBox!.height).toBeGreaterThan(wideBox!.height * 2);
  });

  // M18-S07 — "Destaque": 1 large + 4 small tiles, a fixed 5-image template. Verifies the real
  // end-to-end effect on both breakpoints, not just that .gallery-featured-grid is present.
  test('Gallery panel: "Destaque" with 5 photos renders 1 large + 4 small tiles, position and breakpoint both correct, after Publish and reload (M18-S07)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();

    await page.locator(layoutToggle('GALLERY')).click();
    await page.locator(configureButton('GALLERY')).click();

    for (let i = 0; i < 5; i++) {
      await page.getByTestId('gallery-upload-input').setInputFiles({
        name: `photo-${i}.png`,
        mimeType: 'image/png',
        buffer: makeSolidPng(300, 200),
      });
      await expect(page.getByTestId('gallery-image')).toHaveCount(i + 1);
    }

    // Exactly 5 images — "Destaque" must be selectable, not disabled.
    const featuredPill = page.getByTestId('gallery-layout-featured');
    await expect(featuredPill).toBeEnabled();
    await featuredPill.click();
    await page.getByTestId('gallery-featured-position-right').click();
    await page.getByTestId('module-config-apply-desktop').click();

    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.goto(`/${MANAGER_TENANT_SLUG}`);
    const tiles = page.locator('section#gallery a[data-gallery-url]');
    await expect(tiles).toHaveCount(5);

    const bigBox = await tiles.nth(0).boundingBox();
    const smallBox = await tiles.nth(1).boundingBox();
    expect(bigBox).not.toBeNull();
    expect(smallBox).not.toBeNull();
    // Desktop: 4 equal columns, the large tile spans 2 of them and both rows — wider and taller
    // than a small tile, but square itself (see the per-tile squareness assertions below — a
    // uniformly-scaled-but-non-square rectangle would also pass these two alone).
    expect(bigBox!.width).toBeGreaterThan(smallBox!.width * 1.5);
    expect(bigBox!.height).toBeGreaterThan(smallBox!.height);
    // featuredPosition: 'right' — the large tile sits to the right of the small ones.
    expect(bigBox!.x).toBeGreaterThan(smallBox!.x);
    // Every tile — big and small alike — must render exactly square, not just "larger" (CodeRabbit
    // review, PR #329: the original assertions above alone would still pass for a uniformly
    // landscape- or portrait-biased rectangle). A few px of rounding tolerance for real layout math.
    expect(Math.abs(bigBox!.width - bigBox!.height)).toBeLessThan(2);
    expect(Math.abs(smallBox!.width - smallBox!.height)).toBeLessThan(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    const bigBoxMobile = await tiles.nth(0).boundingBox();
    const smallBoxMobile = await tiles.nth(1).boundingBox();
    expect(bigBoxMobile).not.toBeNull();
    expect(smallBoxMobile).not.toBeNull();
    // Mobile: stacked — the large tile is full-width and sits above the small tiles regardless
    // of featuredPosition, which has no effect once collapsed to a single column.
    expect(bigBoxMobile!.y).toBeLessThan(smallBoxMobile!.y);
    expect(bigBoxMobile!.width).toBeGreaterThan(smallBoxMobile!.width * 1.5);
    expect(Math.abs(bigBoxMobile!.width - bigBoxMobile!.height)).toBeLessThan(2);
    expect(Math.abs(smallBoxMobile!.width - smallBoxMobile!.height)).toBeLessThan(2);
  });

  // Default seed state has no logo uploaded (autospa-premium's branding.logoUrl is '') — this
  // test relies on that default rather than explicitly clearing it, since afterEach always
  // restores `original` between tests in this serial block.
  test('Public hotsite: with no logo uploaded, the topbar and footer show the initial-letter fallback and no favicon is set (M18-S03)', async ({
    page,
  }) => {
    expect(original.branding.logoUrl).toBe('');

    await page.goto(`/${MANAGER_TENANT_SLUG}`);

    await expect(page.locator('[data-testid="hotsite-auth-bar"] img')).toHaveCount(0);
    await expect(page.locator('footer img')).toHaveCount(0);
    await expect(page.locator('link[rel="icon"]')).toHaveCount(0);
  });

  // First E2E coverage of the Manifesto tab (M18-S02). Reads the textarea's actual rendered
  // value (already materialized to all 8 module types by HotsiteEditor's draft construction)
  // rather than assuming the raw seed's shape, so this doesn't depend on which module types
  // autospa-premium's seed happens to include.
  test('Manifesto tab: editing branding + a module toggle directly in JSON persists after Aplicar, Publish, and reload (M18-S02)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Manifesto' }).click();

    const textarea = page.getByTestId('hotsite-manifest-textarea');
    const current = JSON.parse(await textarea.inputValue()) as Pick<
      HotsiteAdminContentResponse,
      'branding' | 'layout' | 'seo'
    >;
    current.branding.primaryColor = '#123456';
    const contactModule = current.layout.find((module) => module.type === 'CONTACT')!;
    const contactWasEnabled = contactModule.enabled;
    contactModule.enabled = !contactWasEnabled;
    await textarea.fill(JSON.stringify(current));
    await page.getByTestId('hotsite-manifest-apply').click();

    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('hotsite-primary-color')).toHaveValue('#123456');
    await page.getByRole('tab', { name: 'Layout' }).click();
    await expect(page.locator(layoutToggle('CONTACT'))).toHaveAttribute(
      'aria-checked',
      String(!contactWasEnabled),
    );
  });

  test('Manifesto tab: malformed JSON shows an inline error and leaves the draft unchanged (M18-S02)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Manifesto' }).click();

    await page.getByTestId('hotsite-manifest-textarea').fill('{ not valid json');
    await page.getByTestId('hotsite-manifest-apply').click();

    await expect(page.getByTestId('hotsite-manifest-error')).toBeVisible();
    await page.getByRole('tab', { name: 'Branding' }).click();
    await expect(page.getByTestId('hotsite-primary-color')).toHaveValue(
      original.branding.primaryColor,
    );
  });

  test('Manifesto tab: a structurally valid but business-rule-invalid value round-trips through the real backend rejection (M18-S02)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Manifesto' }).click();

    const textarea = page.getByTestId('hotsite-manifest-textarea');
    const current = JSON.parse(await textarea.inputValue()) as Pick<
      HotsiteAdminContentResponse,
      'branding' | 'layout' | 'seo'
    >;
    current.branding.primaryColor = 'not-a-color';
    await textarea.fill(JSON.stringify(current));
    // Structural validation only checks the primitive TYPE (string), so "not-a-color" passes
    // Aplicar — it's rejected only by the real backend's hex-format rule, on Publish.
    await page.getByTestId('hotsite-manifest-apply').click();
    await expect(page.getByTestId('hotsite-manifest-error')).not.toBeVisible();

    await page.getByTestId('hotsite-publish-desktop').click();

    await expect(page.getByTestId('hotsite-action-error-banner')).toBeVisible();
  });

  test('Booking CTA Calendar section: toggling datePickerType and editing carouselDays persist after reload (M18-S01)', async ({
    page,
  }) => {
    await page.goto('/dashboard/hotsite');
    await page.getByRole('tab', { name: 'Layout' }).click();

    // BOOKING_CTA is absent from the autospa-premium seed layout — materializeLayout() gives it
    // a disabled row with default data, same as ABOUT/TESTIMONIALS above.
    await page.locator(layoutToggle('BOOKING_CTA')).click();
    await page.locator(configureButton('BOOKING_CTA')).click();
    await page.locator('#booking-cta-title').fill('Agende seu horário');
    await page.locator('#booking-cta-cta-label').fill('Agendar agora');

    // Default datePickerType is carousel — carouselDays is visible
    await expect(page.getByTestId('booking-cta-date-picker-type-carousel')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await page.locator('#booking-cta-carousel-days').fill('21');

    // Switching to calendar hides carouselDays
    await page.getByTestId('booking-cta-date-picker-type-calendar').click();
    await expect(page.locator('#booking-cta-carousel-days')).toHaveCount(0);

    await page.getByTestId('module-config-apply-desktop').click();
    await page.getByTestId('hotsite-publish-desktop').click();
    await expect(page.getByTestId('hotsite-action-success-banner')).toBeVisible();

    await page.reload();
    await page.getByRole('tab', { name: 'Layout' }).click();
    await page.locator(configureButton('BOOKING_CTA')).click();

    await expect(page.getByTestId('booking-cta-date-picker-type-calendar')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await expect(page.locator('#booking-cta-carousel-days')).toHaveCount(0);

    // Switching back to carousel must reveal the *previously saved* carouselDays (21), not the
    // default (14) — proves the value actually persisted across the save/reload above, rather
    // than the mode toggle alone happening to look like it did.
    await page.getByTestId('booking-cta-date-picker-type-carousel').click();
    await expect(page.locator('#booking-cta-carousel-days')).toHaveValue('21');
  });

  // The next 3 tests exercise the *public* booking page's date-picker widgets, configured via the
  // admin API rather than the editor UI — reusing this describe's existing beforeEach/afterEach
  // snapshot-and-restore lifecycle for autospa-premium's shared hotsite-config row keeps them
  // serialized against the config-mutating tests above instead of racing a second tenant.
  test('Calendar widget on the public booking page: month grid renders, month navigation works, and an in-range day advances to step 3 (M18-S01)', async ({
    page,
  }) => {
    await updateHotsiteConfig(page, {
      ...toUpdateRequest(original),
      layout: [
        ...original.layout,
        {
          type: 'BOOKING_CTA',
          enabled: true,
          data: {
            title: 'Agende seu horário',
            ctaLabel: 'Agendar agora',
            datePickerType: 'calendar',
          },
        },
      ],
    });

    await page.goto(`/${MANAGER_TENANT_SLUG}/booking`);
    await page
      .locator('[data-testid="service-card"][data-requires-pickup="false"]')
      .first()
      .click();
    await page.locator('[data-testid="step-next"]').click();

    await expect(page.locator('[data-testid="calendar-day"]').first()).toBeVisible();

    // Month navigation re-fetches without erroring, forward then back. Located by data-testid,
    // not translated button copy, so this doesn't break if the tenant locale or copy changes.
    await page.getByTestId('calendar-next-month').click();
    await expect(page.locator('[data-testid="calendar-day"]').first()).toBeVisible();
    await page.getByTestId('calendar-previous-month').click();
    await expect(page.locator('[data-testid="calendar-day"]').first()).toBeVisible();

    await page.locator('[data-testid="calendar-day"]:not([disabled])').first().click();
    await page.locator('[data-testid="time-slot"]').first().click();
    await page.locator('[data-testid="step-next"]').click();

    await expect(page.locator('[data-testid="input-name"]')).toBeVisible();
  });

  test('Calendar widget on the public booking page: blocks selection past maxBookingAdvanceDays with a message (M18-S01)', async ({
    page,
  }) => {
    // The boundary date (maxDateIso = today + maxBookingAdvanceDays - 1) must not land on the
    // last day of its own month — if it did, every day in the initially-visible month would be
    // in range and endMonth (capped at the boundary month) would block forward navigation
    // entirely, making the out-of-range state genuinely unreachable in the UI that day. On an
    // ordinary day, maxBookingAdvanceDays=1 already leaves later, out-of-range days visible in
    // the current month. The one day that isn't true — today is itself the last day of the
    // month — bumps it to 2 so the boundary falls on day 1 of *next* month instead (never a
    // month-end itself), and the test advances the calendar forward once to reach it.
    const today = new Date();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const isLastDayOfMonth = today.getDate() === daysInMonth;
    const maxBookingAdvanceDays = isLastDayOfMonth ? 2 : 1;

    await updateTenantSettings(page, {
      settings: {
        booking: { ...originalSettings.settings.booking, maxBookingAdvanceDays },
      },
    });

    await updateHotsiteConfig(page, {
      ...toUpdateRequest(original),
      layout: [
        ...original.layout,
        {
          type: 'BOOKING_CTA',
          enabled: true,
          data: {
            title: 'Agende seu horário',
            ctaLabel: 'Agendar agora',
            datePickerType: 'calendar',
          },
        },
      ],
    });

    await page.goto(`/${MANAGER_TENANT_SLUG}/booking`);
    await page
      .locator('[data-testid="service-card"][data-requires-pickup="false"]')
      .first()
      .click();
    await page.locator('[data-testid="step-next"]').click();

    await expect(page.locator('[data-testid="calendar-day"]').first()).toBeVisible();

    if (isLastDayOfMonth) {
      await page.locator('[data-testid="calendar-next-month"]').click();
      await expect(page.locator('[data-testid="calendar-day"]').first()).toBeVisible();
    }

    await page.locator('[data-testid="calendar-day"]').last().click();

    await expect(page.locator('[data-testid="calendar-out-of-range-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="input-name"]')).not.toBeVisible();
  });

  test('Carousel widget on the public booking page clamps its window to maxBookingAdvanceDays even when carouselDays is configured larger (M18-S01)', async ({
    page,
  }) => {
    // Save carouselDays: 30 *before* lowering maxBookingAdvanceDays — Part 6's own backend
    // validation now rejects saving carouselDays above the *current* limit, so the only way this
    // stale-relative-to-settings state can legitimately exist is a later, independent settings
    // change (exactly what Part 5's client-side clamp exists to guard against).
    await updateHotsiteConfig(page, {
      ...toUpdateRequest(original),
      layout: [
        ...original.layout,
        {
          type: 'BOOKING_CTA',
          enabled: true,
          data: {
            title: 'Agende seu horário',
            ctaLabel: 'Agendar agora',
            datePickerType: 'carousel',
            carouselDays: 30,
          },
        },
      ],
    });
    await updateTenantSettings(page, {
      settings: { booking: { ...originalSettings.settings.booking, maxBookingAdvanceDays: 5 } },
    });

    await page.goto(`/${MANAGER_TENANT_SLUG}/booking`);
    await page
      .locator('[data-testid="service-card"][data-requires-pickup="false"]')
      .first()
      .click();
    await page.locator('[data-testid="step-next"]').click();

    await expect(page.locator('[data-testid="day-option"]').first()).toBeVisible();
    expect(await page.locator('[data-testid="day-option"]').count()).toBeLessThanOrEqual(5);
  });

  // Closes a known gap, not a copy of an established test: no existing E2E spec asserts actual
  // --ba-* computed values (only unit-level apply-branding.spec.ts and axe scans with
  // color-contrast disabled) — this is the first real-browser check that a --ba-* token renders
  // as the tenant's actual configured color, not just the component's hardcoded fallback.
  test("Calendar widget's selected day reflects the tenant's configured primaryColor, not the fallback (M18-S01)", async ({
    page,
  }) => {
    const customPrimary = '#7c3aed'; // distinct from both the seed default (#2563EB) and every widget's own inline-style fallback (#2563eb)

    await updateHotsiteConfig(page, {
      ...toUpdateRequest(original),
      branding: { ...original.branding, primaryColor: customPrimary },
      layout: [
        ...original.layout,
        {
          type: 'BOOKING_CTA',
          enabled: true,
          data: {
            title: 'Agende seu horário',
            ctaLabel: 'Agendar agora',
            datePickerType: 'calendar',
          },
        },
      ],
    });

    await page.goto(`/${MANAGER_TENANT_SLUG}/booking`);
    await page
      .locator('[data-testid="service-card"][data-requires-pickup="false"]')
      .first()
      .click();
    await page.locator('[data-testid="step-next"]').click();

    const availableDay = page.locator('[data-testid="calendar-day"]:not([disabled])').first();
    await availableDay.waitFor();
    await availableDay.click();

    await expect(availableDay).toHaveCSS('background-color', 'rgb(124, 58, 237)');
  });
});

test.describe('hotsite editor (STAFF)', () => {
  test('is redirected away from /dashboard/hotsite — MANAGER-only route', async ({ page }) => {
    await loginAsStaff(page, 'funcionario@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/dashboard/hotsite');

    await expect(page).not.toHaveURL(/\/dashboard\/hotsite/);
  });
});
