import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { HotsiteAdminContentResponse, LeadFormConfigResponse } from '@ikaro/types';
import { loginAsStaff } from './helpers/auth';
import {
  getHotsiteConfig,
  publishHotsite,
  toUpdateRequest,
  unpublishHotsite,
  updateHotsiteConfig,
} from './helpers/hotsite';
import {
  getLeadFormConfig,
  toLeadFormUpdateRequest,
  updateLeadFormConfig,
} from './helpers/platform';

// autospa-premium: same shared-tenant convention as guest-lead-form.spec.ts (this file also
// mutates its hotsite-config row).
const MANAGER_EMAIL = 'admin@autospa.com.br';
const MANAGER_TENANT_SLUG = 'autospa-premium';

const QUESTION_ID = randomUUID();

// This is the milestone's only spec exercising the full loop: manager enables the module ->
// nav item appears -> guest submits -> manager sees it in the list -> manager opens the detail
// and every answer renders correctly (M20-S10).
test.describe.serial('leads golden path — M20-S10', () => {
  let originalHotsite: HotsiteAdminContentResponse;
  let originalLeadForm: LeadFormConfigResponse;

  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    originalHotsite = await getHotsiteConfig(page);
    originalLeadForm = await getLeadFormConfig(page);

    // Start from disabled, regardless of the fixture's own baseline — the nav-visibility
    // assertion below needs a real absent -> present transition.
    await updateHotsiteConfig(page, {
      ...toUpdateRequest(originalHotsite),
      layout: [
        ...originalHotsite.layout.filter((module) => module.type !== 'LEAD_FORM'),
        {
          type: 'LEAD_FORM',
          enabled: false,
          data: { title: 'Quer um orçamento personalizado?', ctaLabel: 'Preencher formulário' },
        },
      ],
    });
  });

  test.afterEach(async ({ page }) => {
    await updateLeadFormConfig(page, toLeadFormUpdateRequest(originalLeadForm));
    await updateHotsiteConfig(page, toUpdateRequest(originalHotsite));
    if (originalHotsite.isPublished) {
      await publishHotsite(page);
    } else {
      await unpublishHotsite(page);
    }
  });

  test('config enables the module and reveals "Leads" in the nav, guest submits, manager sees it in the list and detail', async ({
    page,
    browser,
  }) => {
    // 1. Before config: "Leads" is absent from the sidebar.
    await page.goto('/dashboard/bookings');
    await expect(page.locator('[data-testid="sidebar-nav-leads"]')).toHaveCount(0);

    // 2. Manager configures the module (question catalog + enable), matching S08's real save
    // shape — audienceMode/questions plus the layout's enabled flag, both through the
    // consolidated PATCH /v1/tenants/hotsite endpoint.
    await updateLeadFormConfig(page, {
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: [
        {
          id: QUESTION_ID,
          label: 'Qual serviço você precisa?',
          type: 'TEXT',
          required: true,
          order: 1,
        },
      ],
    });
    await updateHotsiteConfig(page, {
      ...toUpdateRequest(await getHotsiteConfig(page)),
      layout: (await getHotsiteConfig(page)).layout.map((module) =>
        module.type === 'LEAD_FORM' ? { ...module, enabled: true } : module,
      ),
    });
    if (!originalHotsite.isPublished) await publishHotsite(page);

    // 3. After config: "Leads" now appears in the sidebar.
    await page.goto('/dashboard/bookings');
    await expect(page.locator('[data-testid="sidebar-nav-leads"]')).toBeVisible();

    // 4. Guest submits, on a fresh cookie-free context (mirrors guest-lead-form.spec.ts's own
    // rationale — the fixture's page carries the manager's staff session).
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await guestPage.goto(`/${MANAGER_TENANT_SLUG}/lead-form`);
    await guestPage.getByTestId('lead-form-name').fill('Fernanda Alves');
    await guestPage.getByTestId('lead-form-email').fill('fernanda@example.com');
    await guestPage.getByTestId('lead-form-phone').fill('+5511988887777');
    await guestPage
      .locator(`[data-testid="lead-form-question"][data-question-id="${QUESTION_ID}"]`)
      .fill('Preciso de uma lavagem completa');
    await expect(guestPage.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
      timeout: 15_000,
    });
    await guestPage.getByTestId('lead-form-submit').click();
    await expect(guestPage.getByTestId('lead-form-success')).toBeVisible({ timeout: 15_000 });
    await guestContext.close();

    // 5. Manager sees the submission in the list.
    await page.goto('/dashboard/leads');
    const row = page.locator('[data-testid="lead-submission-row"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('Fernanda Alves');

    // 6. Manager opens the detail and sees every answer correctly.
    await row.click();
    await expect(page).toHaveURL(/\/dashboard\/leads\/[^/]+$/);
    const answers = page.locator('[data-testid="lead-detail-answers"]');
    await expect(answers).toContainText('Qual serviço você precisa?');
    await expect(answers).toContainText('Preciso de uma lavagem completa');
  });
});
