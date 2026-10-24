import { expect, test, type Page } from '@playwright/test';
import type { HotsiteAdminContentResponse, HotsiteModuleType } from '@ikaro/types';
import { loginAsStaff } from './helpers/auth';
import {
  TEMPLATE_NAMES,
  applyTemplateFixture,
  getHotsiteConfig,
  getPublicManifest,
  publishHotsite,
  toUpdateRequest,
  unpublishHotsite,
  updateHotsiteConfig,
  type TemplateName,
} from './helpers/hotsite';

// The six catalogue compositions, applied through the real PATCH + publish and checked on the
// public page at a desktop and a narrow viewport (TD56-S02). The public page fetches its manifest
// on the server, so a fixture cannot be served to the browser: each one is applied for real, which
// is also the only way to prove the backend accepts every composition.
//
// autospa-premium is the MANAGER tenant hotsite-editor.spec.ts uses for the same reason: no
// booking/schedule/service spec touches its hotsite row. One tenant, strictly serial, restored
// afterwards.
const MANAGER_EMAIL = 'admin@autospa.com.br';
const SLUG = 'autospa-premium';

const DESKTOP = { width: 1280, height: 800 } as const;
const MOBILE = { width: 390, height: 844 } as const;

function rgbFromHex(hex: string): string {
  return `rgb(${[1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
}

// The anchor each enabled section renders, in page order. HERO has no id; it is the first section.
const SECTION_SELECTOR: Partial<Record<HotsiteModuleType, string>> = {
  HERO: 'main > div:first-of-type > section[data-variant]',
  SERVICE_LIST: '#service-list',
  GALLERY: '#gallery',
  TESTIMONIALS: '#testimonials',
  BOOKING_CTA: '#booking-form',
  ABOUT: '#about',
  CONTENT_BLOCK: '#content-block',
  CONTACT: '#contact',
  LEAD_FORM: '#lead-form',
  FOOTER: 'footer',
};

// What makes each composition recognisably itself: an engine capability only its template uses.
// Kept in step with the reconciled fixtures (journeys/manager/prototypes/hotsite/hotsite-impl/
// manifesto-*.json), which are the source of truth for each composition.
const SIGNATURE: Readonly<Record<TemplateName, readonly string[]>> = {
  beloauto: ['[data-variant="technical-callout"]', '[data-testid="section-overlay"]'],
  casa47: ['[data-variant="image-statement"]', 'section[data-variant="left-aligned"]'],
  'mimo-pet': ['[data-testid="feature-service-card"]', '[data-testid="trust-grid-tiles"]'],
  origem: [
    '[data-testid="numbered-service"]',
    '[data-testid="editorial-quotes"]',
    '[data-variant="immersive-statement"]',
  ],
  'clinica-lume': ['[data-testid="steps"]', '[data-testid="ruled-service-list"]'],
  'lume-studio': [
    '[data-testid="collage-images"]',
    'section[data-variant="immersive"]',
    'section#lead-form',
  ],
};

async function sectionTops(page: Page, types: readonly HotsiteModuleType[]): Promise<number[]> {
  const tops: number[] = [];
  for (const type of types) {
    const selector = SECTION_SELECTOR[type];
    if (!selector) continue;
    tops.push(
      await page
        .locator(selector)
        .first()
        .evaluate((element) => element.getBoundingClientRect().top + window.scrollY),
    );
  }
  return tops;
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function openPublicHotsite(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  await page.goto(`/${SLUG}`);
  await expect(page.locator('main')).toBeVisible();
  // The top bar resolves its session after hydration: once the sign-in link shows, the page is
  // interactive, so keyboard and click handlers (the mobile menu) are attached.
  await expect(page.getByTestId('hotsite-login-link')).toBeVisible();
}

test.describe.serial('hotsite template compositions (MANAGER)', () => {
  // Cleared before every test and set only once this test has captured the tenant's hotsite, so a
  // failed login or read can never write a previous test's snapshot back over the shared tenant.
  let original: HotsiteAdminContentResponse | undefined;

  test.beforeEach(async ({ page }) => {
    original = undefined;
    await loginAsStaff(page, MANAGER_EMAIL, SLUG);
    original = await getHotsiteConfig(page);
  });

  test.afterEach(async ({ page }) => {
    // One shared hotsite row per tenant: put it back exactly as found, publish state included,
    // even when a test timed out (afterEach always runs; an in-body finally may not).
    if (!original) return;
    await updateHotsiteConfig(page, toUpdateRequest(original));
    if (original.isPublished) {
      await publishHotsite(page);
    } else {
      await unpublishHotsite(page);
    }
  });

  for (const name of TEMPLATE_NAMES) {
    test(`${name}: renders its composition on desktop and on a narrow viewport`, async ({
      page,
    }) => {
      const fixture = await applyTemplateFixture(page, name);
      const enabled = fixture.layout.filter((module) => module.enabled);
      const enabledSections = enabled
        .map((module) => module.type)
        .filter((type) => SECTION_SELECTOR[type] !== undefined);

      // The public manifest sits behind a tagged data cache: wait for the publish to reach it.
      await expect
        .poll(async () => (await getPublicManifest(page, SLUG)).branding.primaryColor)
        .toBe(fixture.branding.primaryColor);

      await test.step('desktop: every enabled section, in the manifest order', async () => {
        await openPublicHotsite(page, DESKTOP);

        for (const type of enabledSections) {
          await expect(page.locator(SECTION_SELECTOR[type]!).first()).toBeVisible();
        }
        const tops = await sectionTops(page, enabledSections);
        expect(tops).toEqual([...tops].sort((a, b) => a - b));
        for (const selector of SIGNATURE[name]) {
          await expect(page.locator(selector).first()).toBeVisible();
        }
        await expect(page.locator('#about[data-variant="bleed"]')).toBeVisible();
        await expect(page.locator('.gallery-featured-grid')).toHaveAttribute(
          'data-featured-count',
          name === 'lume-studio' ? '3' : '4',
        );
        const cta = fixture.layout[0].data.cta as { label: string; target: string };
        await expect(page.getByTestId('hotsite-navigation-cta')).toHaveText(cta.label);
        await expect(page.getByTestId('hotsite-navigation-cta')).toHaveAttribute(
          'href',
          `/${SLUG}/${cta.target === 'lead-form' ? 'lead-form' : 'booking'}`,
        );
        const footer = enabled.find((module) => module.type === 'FOOTER');
        expect(footer?.presentation?.surface).toBe('custom');
        if (footer?.presentation?.customColor) {
          await expect(page.locator('footer')).toHaveCSS(
            'background-color',
            rgbFromHex(footer.presentation.customColor),
          );
        }
        await expectNoHorizontalOverflow(page);
      });

      await test.step('a disabled section is not on the page', async () => {
        const disabled = fixture.layout.filter(
          (module) => !module.enabled && SECTION_SELECTOR[module.type] !== undefined,
        );
        for (const disabledModule of disabled) {
          await expect(page.locator(SECTION_SELECTOR[disabledModule.type]!)).toHaveCount(0);
        }
      });

      await test.step('the home page never offers a date or time control', async () => {
        await expect(
          page.locator('input[type="date"], input[type="time"], input[type="datetime-local"]'),
        ).toHaveCount(0);
      });

      await test.step('a booking CTA enters the service-first booking flow', async () => {
        const bookingCta = enabled.some((module) => module.type === 'BOOKING_CTA');
        const link = page.locator(`#booking-form a[href="/${SLUG}/booking"]`);
        await expect(link).toHaveCount(bookingCta ? 1 : 0);
      });

      await test.step('narrow viewport: stays within the screen width', async () => {
        await openPublicHotsite(page, MOBILE);

        for (const type of enabledSections) {
          await expect(page.locator(SECTION_SELECTOR[type]!).first()).toBeVisible();
        }
        await expectNoHorizontalOverflow(page);
      });
    });
  }

  for (const name of ['casa47', 'clinica-lume'] as const) {
    test(`${name}: navigation links on desktop, a keyboard-operable menu on mobile, one header`, async ({
      page,
    }) => {
      const fixture = await applyTemplateFixture(page, name);
      const items = (fixture.layout[0].data.items ?? []) as { label: string; target: string }[];
      expect(items.length).toBeGreaterThan(0);

      await openPublicHotsite(page, DESKTOP);
      await expect(page.locator('header')).toHaveCount(1);
      const desktopNav = page.getByTestId('hotsite-navigation');
      await expect(desktopNav).toBeVisible();
      for (const item of items) {
        await expect(desktopNav.getByRole('link', { name: item.label })).toHaveAttribute(
          'href',
          `/${SLUG}#${item.target}`,
        );
      }
      await expect(page.getByTestId('hotsite-navigation-menu')).toBeHidden();

      await page.setViewportSize(MOBILE);
      await expect(desktopNav).toBeHidden();
      const menu = page.getByTestId('hotsite-navigation-menu');
      await expect(menu).toBeVisible();

      const summary = menu.locator('summary');
      await summary.focus();
      await page.keyboard.press('Enter');
      await expect(menu.getByRole('link', { name: items[0].label })).toBeVisible();

      await page.keyboard.press('Escape');
      await expect(menu.getByRole('link', { name: items[0].label })).toBeHidden();

      await summary.focus();
      await page.keyboard.press('Enter');
      await menu.getByRole('link', { name: items[1].label }).click();
      await expect(page).toHaveURL(new RegExp(`#${items[1].target}$`));
      await expect(menu.getByRole('link', { name: items[1].label })).toBeHidden();
    });
  }

  test('casa47: the navigation also appears on the booking page, which keeps the service-first flow', async ({
    page,
  }) => {
    await applyTemplateFixture(page, 'casa47');

    await page.setViewportSize(DESKTOP);
    await page.goto(`/${SLUG}/booking`);

    await expect(page.locator('header')).toHaveCount(1);
    await expect(
      page.getByTestId('hotsite-navigation').getByRole('link', { name: 'Serviços' }),
    ).toHaveAttribute('href', `/${SLUG}#service-list`);
    await expect(
      page.locator('input[type="date"], input[type="time"], input[type="datetime-local"]'),
    ).toHaveCount(0);
  });
});
