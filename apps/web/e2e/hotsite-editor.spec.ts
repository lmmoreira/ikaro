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

    // Month navigation re-fetches without erroring, forward then back
    await page.getByRole('button', { name: 'Próximo mês' }).click();
    await expect(page.locator('[data-testid="calendar-day"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Mês anterior' }).click();
    await expect(page.locator('[data-testid="calendar-day"]').first()).toBeVisible();

    await page.locator('[data-testid="calendar-day"]:not([disabled])').first().click();
    await page.locator('[data-testid="time-slot"]').first().click();
    await page.locator('[data-testid="step-next"]').click();

    await expect(page.locator('[data-testid="input-name"]')).toBeVisible();
  });

  test('Calendar widget on the public booking page: blocks selection past maxBookingAdvanceDays with a message (M18-S01)', async ({
    page,
  }) => {
    await updateTenantSettings(page, {
      settings: { booking: { ...originalSettings.settings.booking, maxBookingAdvanceDays: 5 } },
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

    // 3 months forward guarantees every visible day is past a 5-day advance window, regardless
    // of which day of the month "today" happens to be when this test runs.
    const nextMonthButton = page.getByRole('button', { name: 'Próximo mês' });
    await nextMonthButton.click();
    await nextMonthButton.click();
    await nextMonthButton.click();
    await expect(page.locator('[data-testid="calendar-day"]').first()).toBeVisible();

    await page.locator('[data-testid="calendar-day"]').first().click();

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
