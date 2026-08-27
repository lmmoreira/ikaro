import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { HotsiteAdminContentResponse, LeadFormConfigResponse } from '@ikaro/types';
import { loginAsCustomer, loginAsStaff, uniqueTestEmail } from './helpers/auth';
import { completeCustomerProfile } from './helpers/customer';
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
    await updateLeadFormConfig(page, toLeadFormUpdateRequest(originalLeadForm));
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

    // A brand-new dev-login customer has no phone/address yet, which would otherwise trigger the
    // pre-existing, unrelated InformationCompletionPrompt gate (app/[slug]/layout.tsx) — a
    // full-screen modal applied to every hotsite route, not just booking, that blocks all
    // interaction (including this page's own submit button) until phone + full address are filled
    // in. That gate is out of this story's scope and stays as-is (M20-S09 PR #433 round 4 decision)
    // — completing the profile here first means this test exercises "sees prefilled fields, edits,
    // submits" (all three contact fields already prefilled), not "starts with an empty phone
    // field" (that narrower scenario is unit-tested instead, in LeadFormWidget.spec.tsx).
    await completeCustomerProfile(page, MANAGER_TENANT_SLUG);

    await page.goto(`/${MANAGER_TENANT_SLUG}/lead-form`);

    await expect(page.getByTestId('lead-form-name')).toHaveValue(new RegExp('.+'), {
      timeout: 10_000,
    });
    await expect(page.getByTestId('lead-form-prefilled-note')).toBeVisible();
    await expect(page.getByTestId('lead-form-phone')).toHaveValue('+5511999999999');

    await page.getByTestId('lead-form-phone').fill('+5511999998888');
    await page
      .locator(`[data-testid="lead-form-question"][data-question-id="${QUESTION_ID}"]`)
      .fill('Enceramento completo');

    // Cloudflare's "always passes visible" test sitekey (1x00000000000000000000AA — the only
    // sitekey this repo ever configures, per M20-S05) auto-verifies without rendering an
    // interactive challenge iframe at all: it injects a dummy token straight into its own hidden
    // `cf-turnstile-response` input the moment `turnstile.render()` resolves. An
    // `iframe[src*="challenges.cloudflare.com"]` never appears for this key — confirmed via local
    // headed/trace debugging (M20-S09 PR #433 round 4) after two rounds of otherwise-correct,
    // unrelated fixes (widget lifecycle stabilization, CSP allowance) failed to make one appear.
    // Wait on the hidden input Cloudflare's own client documents for this exact non-JS-fallback
    // purpose, not on iframe rendering the test key was never going to produce.
    await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(/.+/, {
      timeout: 15_000,
    });

    await page.getByTestId('lead-form-submit').click();

    await expect(page.getByTestId('lead-form-success')).toBeVisible({ timeout: 15_000 });
    // Authenticated auth bar (avatar dropdown), not the guest "Entrar" link — this is the one
    // reason the success view has a customer-specific screenshot in the prototype at all
    // (customer/prototypes/lead-form/01b-success.html's own dev-notes).
    await expect(page.getByTestId('hotsite-auth-bar')).toBeVisible();
    await expect(page.getByTestId('hotsite-login-link')).not.toBeVisible();
  });
});
