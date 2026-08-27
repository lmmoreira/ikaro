import { randomUUID } from 'node:crypto';
import { expect, test, type Browser } from '@playwright/test';
import type { HotsiteAdminContentResponse, LeadFormConfigResponse } from '@ikaro/types';
import { loginAsStaff, uniqueTestEmail } from './helpers/auth';
import {
  getHotsiteConfig,
  publishHotsite,
  toUpdateRequest,
  unpublishHotsite,
  updateHotsiteConfig,
} from './helpers/hotsite';
import {
  getLeadFormConfig,
  getTenantSettings,
  toLeadFormUpdateRequest,
  updateLeadFormConfig,
  updateTenantSettings,
} from './helpers/platform';

// autospa-premium: same shared-tenant convention as leads-golden-path.spec.ts/guest-lead-form.spec.ts
// (this file also mutates its hotsite-config/lead-form-config rows).
const MANAGER_EMAIL = 'admin@autospa.com.br';
const MANAGER_TENANT_SLUG = 'autospa-premium';

const MARITAL_QUESTION_ID = randomUUID();
const CITY_QUESTION_ID = randomUUID();
// Suffixed with the question's own random UUID so a re-run against this shared tenant never
// collides with a prior run's leftover submissions (nothing deletes them after the test) — a
// fixed label would otherwise let an old "casado"/"São Paulo" row silently satisfy the ANDed
// advanced-filter assertion below alongside the new one, breaking its toHaveCount(1) expectation
// (CodeRabbit PR #436 round 1 finding, 2026-08-27).
const MARITAL_LABEL = `Qual seu estado civil? [${MARITAL_QUESTION_ID}]`;
const CITY_LABEL = `Onde você mora? [${CITY_QUESTION_ID}]`;

interface GuestLeadInput {
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly marital: string;
  readonly city: string;
}

// Mirrors leads-golden-path.spec.ts's own guest-submission steps, parameterized so this file can
// seed more than one submission with distinct answers (needed to prove basic search, advanced
// AND-filtering, and the no-results state all work through the real UI end-to-end).
async function submitGuestLead(browser: Browser, input: GuestLeadInput): Promise<void> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/${MANAGER_TENANT_SLUG}/lead-form`);
  await page.getByTestId('lead-form-name').fill(input.name);
  await page.getByTestId('lead-form-email').fill(input.email);
  await page.getByTestId('lead-form-phone').fill(input.phone);
  await page
    .locator(`[data-testid="lead-form-question"][data-question-id="${MARITAL_QUESTION_ID}"]`)
    .fill(input.marital);
  await page
    .locator(`[data-testid="lead-form-question"][data-question-id="${CITY_QUESTION_ID}"]`)
    .fill(input.city);
  // Cloudflare's test sitekey never renders an interactive iframe — wait on the hidden input it
  // writes a dummy token into instead (CLAUDE.md § Cloudflare Turnstile test sitekey precedent).
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
    timeout: 15_000,
  });
  await page.getByTestId('lead-form-submit').click();
  await expect(page.getByTestId('lead-form-success')).toBeVisible({ timeout: 15_000 });
  await context.close();
}

// Local-getter-only — `.toISOString()` reinterprets the local day through UTC, which shifted
// the clicked-cell date by one day whenever the runner's local timezone offset was non-zero
// (found via a real CI failure in LeadFormDateRangeControl.spec.tsx's own version of this
// helper; the calendar widget itself constructs day cells via local Date semantics, so the
// string driving `[data-day=...]` must match using the same local getters, not a UTC round-trip).
function isoDateDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

test.describe.serial('leads search — M20-S13', () => {
  let originalHotsite: HotsiteAdminContentResponse;
  let originalLeadForm: LeadFormConfigResponse;
  let originalMaxSubmissionsPerIpPerDay: number;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    originalHotsite = await getHotsiteConfig(page);
    originalLeadForm = await getLeadFormConfig(page);

    // autospa-premium is also used by guest-lead-form.spec.ts, authenticated-lead-form.spec.ts,
    // and leads-golden-path.spec.ts, all submitting from the same CI runner's IP. CI runs with a
    // single Playwright worker (playwright.config.ts), so those specs' own guest submissions
    // land before this file's turn — the default per-IP cap (3/day, tenant-settings-defaults.ts)
    // is easily already exhausted by the time this beforeAll runs, rejecting the very first
    // submission below with no visible error beyond a timed-out "success" locator. Raised for
    // the duration of this file, restored in afterAll (real CI failure, 2026-08-27).
    const tenantSettings = await getTenantSettings(page);
    originalMaxSubmissionsPerIpPerDay = tenantSettings.settings.leadForm.maxSubmissionsPerIpPerDay;
    await updateTenantSettings(page, {
      settings: { leadForm: { maxSubmissionsPerIpPerDay: 100 } },
    });

    await updateHotsiteConfig(page, {
      ...toUpdateRequest(originalHotsite),
      layout: [
        ...originalHotsite.layout.filter((module) => module.type !== 'LEAD_FORM'),
        {
          type: 'LEAD_FORM',
          enabled: true,
          data: { title: 'Quer um orçamento personalizado?', ctaLabel: 'Preencher formulário' },
        },
      ],
    });
    await updateLeadFormConfig(page, {
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [
        {
          id: MARITAL_QUESTION_ID,
          label: MARITAL_LABEL,
          type: 'TEXT',
          required: false,
          order: 1,
        },
        { id: CITY_QUESTION_ID, label: CITY_LABEL, type: 'TEXT', required: false, order: 2 },
      ],
    });
    if (!originalHotsite.isPublished) await publishHotsite(page);

    // Matches both filters (marital=casado AND city=São Paulo).
    await submitGuestLead(browser, {
      name: 'Fernanda Alves',
      email: uniqueTestEmail('leads-search-both'),
      phone: '+5511988887777',
      marital: 'casado',
      city: 'São Paulo',
    });
    // Matches only the marital-status filter — proves the AND excludes a partial match.
    await submitGuestLead(browser, {
      name: 'Ricardo Souza',
      email: uniqueTestEmail('leads-search-partial'),
      phone: '+5511977776666',
      marital: 'casado',
      city: 'Curitiba',
    });

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    await updateTenantSettings(page, {
      settings: { leadForm: { maxSubmissionsPerIpPerDay: originalMaxSubmissionsPerIpPerDay } },
    });
    await updateLeadFormConfig(page, toLeadFormUpdateRequest(originalLeadForm));
    await updateHotsiteConfig(page, toUpdateRequest(originalHotsite));
    if (originalHotsite.isPublished) {
      await publishHotsite(page);
    } else {
      await unpublishHotsite(page);
    }
    await context.close();
  });

  test('basic search finds a submission by name', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    await page.goto('/dashboard/leads');

    await page.getByTestId('leads-search-input').fill('Fernanda');
    await page.getByTestId('leads-search-apply').click();

    const row = page.getByTestId('lead-submission-row').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('Fernanda Alves');
  });

  // No 3-character minimum (M20-S13 implementation, 2026-08-27) — a short but real term (an
  // age, a single-choice answer) must actually be searchable, end to end.
  test('a 1-2 character search term still finds a match', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    await page.goto('/dashboard/leads');

    // 'ri' is unique to the "Ricardo Souza" fixture (name and city both contain it) — the
    // "Fernanda Alves" fixture matches neither.
    await page.getByTestId('leads-search-input').fill('ri');
    await page.getByTestId('leads-search-apply').click();

    const rows = page.getByTestId('lead-submission-row');
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    await expect(rows.first()).toContainText('Ricardo Souza');
  });

  test('a search with no matches shows the distinct no-results state, and "Limpar busca" returns to the unfiltered list', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    await page.goto('/dashboard/leads');

    await page.getByTestId('leads-search-input').fill('nome-que-nao-existe-nunca');
    await page.getByTestId('leads-search-apply').click();

    const noResults = page.getByTestId('leads-no-results');
    await expect(noResults).toBeVisible({ timeout: 15_000 });
    await expect(noResults).toContainText('nome-que-nao-existe-nunca');

    await noResults.getByRole('link').click();
    await expect(page.getByTestId('lead-submission-row').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("switching to advanced mode and back clears the other mode's active query", async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    await page.goto('/dashboard/leads');

    await page.getByTestId('leads-search-input').fill('Fernanda');
    await page.getByTestId('leads-search-apply').click();
    await expect(page).toHaveURL(/search=Fernanda/);

    await page.getByTestId('leads-mode-toggle').click();
    await expect(page).toHaveURL(/\/dashboard\/leads$/);
    await expect(page.getByTestId('leads-advanced-filters')).toBeVisible();

    await page.getByTestId('leads-mode-toggle').click();
    await expect(page.getByTestId('leads-search-input')).toHaveValue('');
  });

  test('2 ANDed advanced filters return only the submission matching both', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    await page.goto('/dashboard/leads');
    await page.getByTestId('leads-mode-toggle').click();

    const questionSelects = page.getByTestId('leads-filter-row-question');
    const valueInputs = page.getByTestId('leads-filter-row-value');

    await questionSelects.nth(0).click();
    await page.getByRole('option', { name: MARITAL_LABEL }).click();
    await valueInputs.nth(0).fill('casado');

    await page.getByTestId('leads-filter-add-row').click();
    await questionSelects.nth(1).click();
    await page.getByRole('option', { name: CITY_LABEL }).click();
    await valueInputs.nth(1).fill('São Paulo');

    await page.getByTestId('leads-filters-apply').click();

    const rows = page.getByTestId('lead-submission-row');
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    await expect(rows.first()).toContainText('Fernanda Alves');
  });

  test('a future date range excluding today narrows the list to zero results', async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    await page.goto('/dashboard/leads');

    await page.getByTestId('leads-date-range-trigger').click();
    await page.locator(`[data-day="${isoDateDaysFromNow(1)}"] button`).click();
    await page.locator(`[data-day="${isoDateDaysFromNow(2)}"] button`).click();
    await page.getByTestId('leads-search-apply').click();

    await expect(page.getByTestId('leads-no-results')).toBeVisible({ timeout: 15_000 });
  });

  test('opening a submission and clicking back restores the active search, not the bare unfiltered list', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    await page.goto('/dashboard/leads');

    await page.getByTestId('leads-search-input').fill('Fernanda');
    await page.getByTestId('leads-search-apply').click();
    await expect(page).toHaveURL(/search=Fernanda/);

    await page.getByTestId('lead-submission-row').first().click();
    await expect(page).toHaveURL(/\/dashboard\/leads\/[^/?]+\?returnTo=/);

    await page.getByTestId('topbar-back-button').click();
    await expect(page).toHaveURL(/search=Fernanda/);
    await expect(page.getByTestId('leads-search-input')).toHaveValue('Fernanda');
  });

  // The real UI never sends both params (they're alternative modes), but a hand-edited URL
  // could — the BFF's own schema rejects both together with 400. page.tsx resolves this
  // client-side before the request is even made (filters wins), so a malformed direct link
  // degrades to the advanced-mode result instead of crashing the whole page load (CodeRabbit +
  // Codex PR #436 round 1 findings, 2026-08-27).
  test('a URL with both search and filters does not crash the page — filters wins', async ({
    page,
  }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    const filters = encodeURIComponent(
      JSON.stringify([{ questionLabel: MARITAL_LABEL, value: 'casado' }]),
    );
    await page.goto(`/dashboard/leads?search=Fernanda&filters=${filters}`);

    await expect(page.getByTestId('leads-advanced-filters')).toBeVisible();
    const rows = page.getByTestId('lead-submission-row');
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    await expect(rows).toHaveCount(2);
  });
});
