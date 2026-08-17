import { expect, test } from '@playwright/test';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { loginAsStaff } from './helpers/auth';
import {
  getHotsiteConfig,
  publishHotsite,
  toUpdateRequest,
  unpublishHotsite,
  updateHotsiteConfig,
} from './helpers/hotsite';

// autospa-premium: same shared-tenant convention as hotsite-editor.spec.ts (this file also
// mutates its hotsite-config row) — see that file's own comment for why this tenant specifically.
const MANAGER_EMAIL = 'admin@autospa.com.br';
const MANAGER_TENANT_SLUG = 'autospa-premium';

// The E2E backend process is started with CHATBOT_LLM_PROVIDER=fake (.github/workflows/pr-tests.yml)
// — FakeLlmAdapter's deterministic reply, never a real billed model call.
function fakeReplyText(userMessage: string): string {
  return `[fake-llm] echo: ${userMessage}`;
}

test.describe.serial('chatbot widget (GUEST) — M19-S11', () => {
  let original: HotsiteAdminContentResponse;

  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    original = await getHotsiteConfig(page);
    await updateHotsiteConfig(page, {
      ...toUpdateRequest(original),
      layout: [
        ...original.layout.filter((module) => module.type !== 'CHATBOT'),
        { type: 'CHATBOT', enabled: true, data: { variant: 'bubble' } },
      ],
    });
    if (!original.isPublished) await publishHotsite(page);
  });

  test.afterEach(async ({ page }) => {
    await updateHotsiteConfig(page, toUpdateRequest(original));
    if (original.isPublished) {
      await publishHotsite(page);
    } else {
      await unpublishHotsite(page);
    }
  });

  test('a guest opens the chat bubble, sends a message, and receives a real reply end to end (widget → BFF → backend → fake adapter)', async ({
    page,
  }) => {
    await page.goto(`/${MANAGER_TENANT_SLUG}`);

    const bubble = page.getByTestId('chatbot-bubble-button');
    await expect(bubble).toBeVisible();
    await bubble.click();

    await expect(page.getByTestId('chatbot-panel')).toBeVisible();

    const message = 'Vocês abrem aos sábados?';
    await page.getByTestId('chatbot-message-input').fill(message);
    await page.getByTestId('chatbot-send-button').click();

    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByText(fakeReplyText(message))).toBeVisible();
  });

  test('sessionId and the visible transcript persist across a reload', async ({ page }) => {
    await page.goto(`/${MANAGER_TENANT_SLUG}`);
    await page.getByTestId('chatbot-bubble-button').click();

    const message = 'Oi';
    await page.getByTestId('chatbot-message-input').fill(message);
    await page.getByTestId('chatbot-send-button').click();
    await expect(page.getByText(fakeReplyText(message))).toBeVisible();

    await page.reload();
    await page.getByTestId('chatbot-bubble-button').click();

    await expect(page.getByText(message)).toBeVisible();
    await expect(page.getByText(fakeReplyText(message))).toBeVisible();
  });
});
