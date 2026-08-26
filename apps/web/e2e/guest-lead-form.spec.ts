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
import { getLeadFormConfig, updateLeadFormConfig } from './helpers/platform';

// autospa-premium: same shared-tenant convention as chatbot-widget.spec.ts/hotsite-editor.spec.ts
// (this file also mutates its hotsite-config row).
const MANAGER_EMAIL = 'admin@autospa.com.br';
const MANAGER_TENANT_SLUG = 'autospa-premium';

const QUESTION_TEXT_ID = randomUUID();
const QUESTION_SINGLE_ID = randomUUID();
const QUESTION_MULTI_ID = randomUUID();

function fixtureQuestions() {
  return [
    {
      id: QUESTION_TEXT_ID,
      label: 'Qual serviço você precisa?',
      type: 'TEXT' as const,
      required: true,
      order: 1,
    },
    {
      id: QUESTION_SINGLE_ID,
      label: 'Qual seu carro favorito?',
      type: 'SINGLE_CHOICE' as const,
      required: true,
      options: ['Sedan', 'SUV'],
      order: 2,
    },
    {
      id: QUESTION_MULTI_ID,
      label: 'Melhores horários para contato?',
      type: 'MULTIPLE_CHOICE' as const,
      required: false,
      options: ['Manhã', 'Tarde'],
      order: 3,
    },
  ];
}

test.describe.serial('lead-form public page (GUEST) — M20-S09', () => {
  let originalHotsite: HotsiteAdminContentResponse;
  let originalLeadForm: LeadFormConfigResponse;

  test.beforeEach(async ({ page }) => {
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
      title: 'Quer um orçamento personalizado?',
      ctaLabel: 'Preencher formulário',
      audienceMode: 'GUEST_AND_CUSTOMER',
      questions: fixtureQuestions(),
    });
    if (!originalHotsite.isPublished) await publishHotsite(page);
  });

  test.afterEach(async ({ page }) => {
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
  });

  test('guest fills the form (one of each question type), completes Turnstile, and submits successfully', async ({
    page,
  }) => {
    await page.goto(`/${MANAGER_TENANT_SLUG}/lead-form`);

    await expect(page.getByTestId('lead-form-name')).toBeVisible();
    await page.getByTestId('lead-form-name').fill('Fernanda Alves');
    await page.getByTestId('lead-form-email').fill('fernanda@example.com');
    await page.getByTestId('lead-form-phone').fill('+5511988887777');

    await page
      .getByTestId(`lead-form-question-${QUESTION_TEXT_ID}`)
      .fill('Preciso de uma lavagem completa');
    await page.getByTestId(`lead-form-question-${QUESTION_SINGLE_ID}-SUV`).check();
    await page.getByTestId(`lead-form-question-${QUESTION_MULTI_ID}-Manhã`).check();

    // Real Turnstile widget script, running against Cloudflare's always-pass test sitekey
    // (NEXT_PUBLIC_TURNSTILE_SITE_KEY, pr-tests.yml) — never mocked/stubbed.
    const turnstileFrame = page.frameLocator('iframe[src*="challenges.cloudflare.com"]');
    await expect(turnstileFrame.locator('body')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('lead-form-submit').click();

    await expect(page.getByTestId('lead-form-success')).toBeVisible({ timeout: 15_000 });
  });

  test('shows a validation error and preserves the entered data when a required field is left blank', async ({
    page,
  }) => {
    await page.goto(`/${MANAGER_TENANT_SLUG}/lead-form`);

    await page.getByTestId('lead-form-name').fill('Fernanda Alves');
    await page.getByTestId('lead-form-submit').click();

    await expect(page.getByTestId('lead-form-validation-banner')).toBeVisible();
    await expect(page.getByTestId('lead-form-email-error')).toBeVisible();
    await expect(page.getByTestId('lead-form-name')).toHaveValue('Fernanda Alves');
  });

  test('a module disabled between teaser render and page load resolves to the Unavailable state', async ({
    page,
  }) => {
    await updateHotsiteConfig(page, {
      ...toUpdateRequest(await getHotsiteConfig(page)),
      layout: (await getHotsiteConfig(page)).layout.map((module) =>
        module.type === 'LEAD_FORM' ? { ...module, enabled: false } : module,
      ),
    });

    await page.goto(`/${MANAGER_TENANT_SLUG}/lead-form`);

    await expect(page.getByTestId('lead-form-name')).not.toBeVisible();
    await expect(page.locator('h1')).toContainText(/Em breve|Coming soon/);
  });
});

test.describe.serial('lead-form public page (CUSTOMER_ONLY gate) — M20-S09', () => {
  let originalHotsite: HotsiteAdminContentResponse;
  let originalLeadForm: LeadFormConfigResponse;

  test.beforeEach(async ({ page }) => {
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
      audienceMode: 'CUSTOMER_ONLY',
      questions: fixtureQuestions(),
    });
    if (!originalHotsite.isPublished) await publishHotsite(page);
  });

  test.afterEach(async ({ page }) => {
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
  });

  test('an unauthenticated visitor is gated with a link into login carrying a returnTo back to this page', async ({
    page,
    context,
  }) => {
    // Clears the staff session set up during fixture setup — this test is about an
    // unauthenticated visitor, not the manager who configured the module.
    await context.clearCookies();

    await page.goto(`/${MANAGER_TENANT_SLUG}/lead-form`);

    await expect(page.getByTestId('lead-form-login-required')).toBeVisible();
    const cta = page.getByTestId('lead-form-login-required-cta');
    await expect(cta).toHaveAttribute(
      'href',
      `/${MANAGER_TENANT_SLUG}/login?returnTo=${encodeURIComponent(`/${MANAGER_TENANT_SLUG}/lead-form`)}`,
    );
  });
});
