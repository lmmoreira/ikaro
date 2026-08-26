import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { HotsiteAdminContentResponse, LeadFormConfigResponse } from '@ikaro/types';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import {
  getHotsiteConfig,
  publishHotsite,
  toUpdateRequest,
  unpublishHotsite,
  updateHotsiteConfig,
} from './helpers/hotsite';
import { getLeadFormConfig, updateLeadFormConfig } from './helpers/platform';

// autospa-premium: same shared-tenant convention as guest-lead-form.spec.ts/chatbot-widget.spec.ts.
const MANAGER_EMAIL = 'admin@autospa.com.br';
const MANAGER_TENANT_SLUG = 'autospa-premium';

const QUESTION_ID = randomUUID();

test.describe.serial('lead-form public page (authenticated CUSTOMER) — M20-S09', () => {
  let originalHotsite: HotsiteAdminContentResponse;
  let originalLeadForm: LeadFormConfigResponse;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    originalHotsite = await getHotsiteConfig(page);
    originalLeadForm = await getLeadFormConfig(page);

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
          id: QUESTION_ID,
          label: 'Qual serviço você precisa?',
          type: 'TEXT',
          required: false,
          order: 1,
        },
      ],
    });
    if (!originalHotsite.isPublished) await publishHotsite(page);
    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    await updateLeadFormConfig(page, {
      audienceMode: originalLeadForm.audienceMode,
      questions: originalLeadForm.questions,
    });
    await updateHotsiteConfig(page, toUpdateRequest(originalHotsite));
    if (originalHotsite.isPublished) {
      await publishHotsite(page);
    } else {
      await unpublishHotsite(page);
    }
    await context.close();
  });

  test('a logged-in customer sees prefilled contact fields, edits, submits, and sees the authenticated success view', async ({
    page,
  }) => {
    const email = uniqueTestEmail('lead-form-customer');
    const customer = await loginAsCustomer(page, email, MANAGER_TENANT_SLUG);
    expect(customer.role).toBe('CUSTOMER');

    await page.goto(`/${MANAGER_TENANT_SLUG}/lead-form`);

    // A brand-new dev-login customer has no phone yet — name/email prefill from the profile,
    // phone stays editable and empty (UC-040 main flow: "visible, editable autofill").
    await expect(page.getByTestId('lead-form-name')).toHaveValue(new RegExp('.+'), {
      timeout: 10_000,
    });
    await expect(page.getByText(/Preenchido com os dados da sua conta/)).toBeVisible();

    await page.getByTestId('lead-form-phone').fill('+5511999998888');
    await page.getByTestId(`lead-form-question-${QUESTION_ID}`).fill('Enceramento completo');

    const turnstileFrame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]');
    await expect(turnstileFrame.locator('body')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('lead-form-submit').click();

    await expect(page.getByTestId('lead-form-success')).toBeVisible({ timeout: 15_000 });
    // Authenticated auth bar (avatar dropdown), not the guest "Entrar" link — this is the one
    // reason the success view has a customer-specific screenshot in the prototype at all
    // (customer/prototypes/lead-form/01b-success.html's own dev-notes).
    await expect(page.getByTestId('hotsite-auth-bar')).toBeVisible();
    await expect(page.getByTestId('hotsite-login-link')).not.toBeVisible();
  });
});
