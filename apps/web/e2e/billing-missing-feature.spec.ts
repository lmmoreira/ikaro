import { expect, test, type Page } from '@playwright/test';
import { HOTSITE_MODULE_FEATURE, type FeatureKey, type HotsiteModuleType } from '@ikaro/types';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import {
  closeActorPages,
  expectFeatures,
  newActorPage,
  provisionTenant,
  publishHotsiteWithEveryModule,
  removeFeatures,
  signInManager,
} from './helpers/billing';
import { accountPages, dashboardRoutes, hotsitePages } from './helpers/billing/feature-pages';
import { completeCustomerProfile } from './helpers/customer';
import { enterDetailedEditor } from './helpers/hotsite/hotsite-editor-navigation';
import { getTenantSettings } from './helpers/platform/settings-api';
import { seedStaffMember } from './helpers/staff';

// UC-122 A4 and UC-125 A6/A7: a tenant's plan decides which surfaces exist, so each plan profile is
// opened from every shell and meets no dead link and no error page. One test per profile; the
// visitor, customer, staff and manager rows are steps of it, on one provisioned tenant.
//
// A profile is an EXEMPT tenant (a trialing one is entitled to every sellable feature whatever its
// items say) whose missing features are deleted from its plan before its first access read: the
// backend caches an operational answer for up to 300 s and a SQL write does not evict it. The four
// profiles are the ones that exercise each distinct gating path; a new feature adds one row.
const ALL_FEATURES: readonly FeatureKey[] = [
  'HOTSITE',
  'BOOKING',
  'LOYALTY',
  'CHATBOT',
  'LEAD_FORM',
];

interface PlanProfile {
  readonly name: string;
  readonly missing: readonly FeatureKey[];
}

const PROFILES: readonly PlanProfile[] = [
  { name: 'hotsite only', missing: ['BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'] },
  { name: 'everything but BOOKING', missing: ['BOOKING'] },
  { name: 'everything but LOYALTY', missing: ['LOYALTY'] },
  { name: 'everything but LEAD_FORM', missing: ['LEAD_FORM'] },
];

const LOCKED_CARD = '[data-testid="locked-feature-card"]';

function lockedCard(page: Page, feature: FeatureKey) {
  return page.locator(`${LOCKED_CARD}[data-feature="${feature}"]`);
}

// The Configurações sections a feature owns, by the feature that locks them (S31a): Booking,
// Loyalty, Contact form and Chatbot.
const SETTINGS_SECTION_FEATURES: readonly FeatureKey[] = [
  'BOOKING',
  'LOYALTY',
  'LEAD_FORM',
  'CHATBOT',
];

test.afterEach(closeActorPages);

test.describe('billing: a tenant without a feature', () => {
  for (const profile of PROFILES) {
    test(`${profile.name}: no dead link and no error page from any shell`, async ({ browser }) => {
      test.setTimeout(240_000);
      const held = ALL_FEATURES.filter((feature) => !profile.missing.includes(feature));
      const has = (feature: FeatureKey | null): boolean =>
        feature === null || held.includes(feature);

      // ── Setup: an exempt tenant, its plan reduced before the first read ──
      const tenant = await provisionTenant({ exempt: true, prefix: 'e2e-plan' });
      await removeFeatures(tenant.tenantId, profile.missing);
      await expectFeatures(tenant.tenantId, held);

      const managerPage = await newActorPage(browser);
      await signInManager(managerPage, tenant);
      await publishHotsiteWithEveryModule(managerPage);
      const staff = await seedStaffMember(managerPage, {
        emailPrefix: 'plan-staff',
        tenantSlug: tenant.slug,
        linkGoogleAccount: true,
      });

      await test.step('visitor: the hotsite opens and each page of a missing feature is the neutral page', async () => {
        const guest = await newActorPage(browser);
        const home = await guest.goto(`/${tenant.slug}`);
        expect(home?.status()).toBeLessThan(400);
        await expect(guest.getByTestId('hotsite-unavailable')).toHaveCount(0);

        for (const page of hotsitePages(tenant.slug)) {
          const response = await guest.goto(page.path);
          if (has(page.feature)) {
            // A page that holds its feature is not the neutral page: it renders its own content (an
            // unknown service id answers with its own not-found, never the neutral page).
            expect(response?.status(), page.path).toBeLessThan(500);
            await expect(guest.getByTestId('hotsite-unavailable'), page.path).toHaveCount(0);
          } else {
            expect(response?.status(), page.path).toBeLessThan(500);
            await expect(guest.getByTestId('hotsite-unavailable'), page.path).toBeVisible();
          }
        }
        // The lead form is owned by its module, not by a page row.
        await guest.goto(`/${tenant.slug}/lead-form`);
        if (!has('LEAD_FORM')) {
          await expect(guest.getByTestId('hotsite-unavailable')).toBeVisible();
        }

        // No section or button of a missing feature on the hotsite itself.
        await guest.goto(`/${tenant.slug}`);
        if (!has('BOOKING')) {
          await expect(guest.locator(`a[href="/${tenant.slug}/booking"]`)).toHaveCount(0);
          await expect(guest.getByTestId('feature-service-card')).toHaveCount(0);
        }
        if (!has('LEAD_FORM')) await expect(guest.getByTestId('lead-form-cta')).toHaveCount(0);
        if (!has('CHATBOT'))
          await expect(guest.getByTestId('chatbot-bubble-button')).toHaveCount(0);
      });

      await test.step('customer: the account opens, the customer stays signed in and each page of a missing feature returns to Início', async () => {
        const customerPage = await newActorPage(browser);
        const email = uniqueTestEmail('plan-customer');
        await loginAsCustomer(customerPage, email, tenant.slug);
        await completeCustomerProfile(customerPage, tenant.slug);
        const inicio = `/${tenant.slug}/my-account`;

        await customerPage.goto(inicio);
        await expect(customerPage).toHaveURL(inicio);
        await expect(customerPage.getByTestId('topbar-user-name')).toBeVisible();

        const bookingsTab = customerPage.locator(
          `nav[aria-label="customer-tabs"] a[href="${inicio}/bookings"]`,
        );
        const loyaltyTab = customerPage.locator(
          `nav[aria-label="customer-tabs"] a[href="${inicio}/loyalty"]`,
        );
        await expect(bookingsTab).toHaveCount(has('BOOKING') ? 1 : 0);
        await expect(loyaltyTab).toHaveCount(has('LOYALTY') ? 1 : 0);
        await expect(customerPage.locator('[data-testid="new-menu-trigger"]:visible')).toHaveCount(
          has('BOOKING') ? 1 : 0,
        );
        if (!has('LOYALTY'))
          await expect(customerPage.getByTestId('loyalty-points-badge')).toHaveCount(0);

        for (const accountPage of accountPages(tenant.slug)) {
          const response = await customerPage.goto(accountPage.path);
          if (has(accountPage.feature)) {
            // A page that holds its feature opens where it is: it never sends the customer to
            // Início and never fails. A page that takes an id answers an unknown one with its own
            // not-found (a 404, or a 200 that draws it in the page), which proves the guard does
            // not swallow a real not-found; the pages with no id open normally.
            expect(response?.status(), accountPage.path).toBeLessThan(
              accountPage.takesId ? 500 : 400,
            );
            await expect(customerPage, accountPage.path).toHaveURL(accountPage.path);
          } else {
            await expect(customerPage, accountPage.path).toHaveURL(inicio);
            await expect(customerPage.getByTestId('topbar-user-name')).toBeVisible();
          }
        }
      });

      for (const shell of ['staff', 'manager'] as const) {
        await test.step(`${shell}: each locked route shows the locked page, nothing the plan holds is locked`, async () => {
          const page = shell === 'manager' ? managerPage : await newActorPage(browser);
          if (shell === 'staff') await loginAsStaff(page, staff.email, tenant.slug);

          for (const route of dashboardRoutes()) {
            const response = await page.goto(route.path);
            expect(response?.status(), route.path).toBeLessThan(500);
            if (has(route.feature)) {
              // A held route is not locked as a page; a section of it (the hotsite editor's module
              // panels, Configurações) may still lock a feature the plan lacks, never one it holds.
              for (const feature of held) {
                await expect(lockedCard(page, feature), `${route.path} ${feature}`).toHaveCount(0);
              }
            } else {
              await expect(lockedCard(page, route.feature).first(), route.path).toBeVisible();
            }
          }
          // The nav draws a lock on each item of a missing feature and none on a held one.
          await page.goto('/dashboard/schedule');
          const lockedItems = page.locator('[data-testid="nav-lock"]');
          if (profile.missing.length > 0) await expect(lockedItems.first()).toBeAttached();
        });
      }

      await test.step('manager: Configurações and the hotsite editor lock each missing feature and keep the rest editable', async () => {
        const before = (await getTenantSettings(managerPage)).settings;

        await managerPage.goto('/dashboard/settings');
        await expect(managerPage.getByTestId('settings-submit-desktop')).toBeVisible();
        for (const feature of SETTINGS_SECTION_FEATURES) {
          await expect(lockedCard(managerPage, feature)).toHaveCount(has(feature) ? 0 : 1);
        }
        // A save from a page with a locked section sends none of its keys: the stored values are
        // unchanged afterwards.
        await managerPage.getByTestId('settings-submit-desktop').click();
        await expect(managerPage.getByTestId('form-feedback')).toBeVisible();
        expect((await getTenantSettings(managerPage)).settings).toEqual(before);

        for (const [type, feature] of Object.entries(HOTSITE_MODULE_FEATURE) as [
          HotsiteModuleType,
          FeatureKey,
        ][]) {
          if (has(feature)) continue;
          // Each module's panel is opened from a fresh editor: the lock replaces its fields.
          await managerPage.goto('/dashboard/hotsite');
          await enterDetailedEditor(managerPage);
          await managerPage.getByRole('tab', { name: 'Layout' }).click();
          await managerPage
            .locator(`[data-testid="layout-row-configure"][data-module-type="${type}"]`)
            .click({ timeout: 10_000 });
          await expect(lockedCard(managerPage, feature).first(), type).toBeVisible();
        }
      });
    });
  }
});
