import { test, expect } from '@playwright/test';
import { loginAsCustomer, uniqueTestEmail } from './helpers/auth';

const validAddress = {
  street: 'Rua das Acácias',
  number: '45',
  neighborhood: 'Jardim América',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30130-020',
};

async function fillValidAddress(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('#information-completion-address-street').fill(validAddress.street);
  await page.locator('#information-completion-address-number').fill(validAddress.number);
  await page
    .locator('#information-completion-address-neighborhood')
    .fill(validAddress.neighborhood);
  await page.locator('#information-completion-address-city').fill(validAddress.city);
  await page.locator('#information-completion-address-state').fill(validAddress.state);
  await page.locator('#information-completion-address-zip-code').fill(validAddress.zipCode);
}

test.describe('Information completion prompt (mandatory phone + address)', () => {
  test('a customer with no phone/address sees the mandatory, non-dismissible prompt', async ({
    page,
  }) => {
    const email = uniqueTestEmail('icp-mandatory');
    await loginAsCustomer(page, email, 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto');

    await expect(page.locator('[data-testid="information-completion-prompt"]')).toBeVisible();
    await expect(page.locator('[data-testid="information-completion-phone-prefix"]')).toHaveText(
      '+55',
    );
  });

  test('shows a phone-specific error and does not submit when the phone is invalid', async ({
    page,
  }) => {
    const email = uniqueTestEmail('icp-phone-invalid');
    await loginAsCustomer(page, email, 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto');
    await expect(page.locator('[data-testid="information-completion-prompt"]')).toBeVisible();

    await page.locator('[data-testid="information-completion-phone-input"]').fill('1199999');
    await page.locator('[data-testid="information-completion-submit"]').click();

    await expect(page.locator('[data-testid="information-completion-error"]')).toContainText(
      'telefone válido',
    );
    // Prompt is still open — submission was blocked client-side
    await expect(page.locator('[data-testid="information-completion-prompt"]')).toBeVisible();
  });

  test('highlights the address fields and does not submit when the address is incomplete', async ({
    page,
  }) => {
    const email = uniqueTestEmail('icp-address-incomplete');
    await loginAsCustomer(page, email, 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto');
    await expect(page.locator('[data-testid="information-completion-prompt"]')).toBeVisible();

    await page.locator('[data-testid="information-completion-phone-input"]').fill('11999999999');
    // Leave address empty
    await page.locator('[data-testid="information-completion-submit"]').click();

    await expect(page.locator('#information-completion-address-street')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.locator('[data-testid="information-completion-prompt"]')).toBeVisible();
  });

  test('submitting a valid phone + address closes the prompt and persists across reload', async ({
    page,
  }) => {
    const email = uniqueTestEmail('icp-success');
    await loginAsCustomer(page, email, 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto');
    await expect(page.locator('[data-testid="information-completion-prompt"]')).toBeVisible();

    await page.locator('[data-testid="information-completion-phone-input"]').fill('11999999999');
    await fillValidAddress(page);
    await page.locator('[data-testid="information-completion-submit"]').click();

    await expect(page.locator('[data-testid="information-completion-prompt"]')).not.toBeVisible();

    // Reload: the profile is now complete, so the prompt must not reappear
    await page.reload();
    await expect(page.locator('[data-testid="information-completion-prompt"]')).not.toBeVisible();
  });

  test('"Sair" logs the customer out instead of requiring the form to be filled', async ({
    page,
  }) => {
    const email = uniqueTestEmail('icp-sign-out');
    await loginAsCustomer(page, email, 'lavacar-beloauto');

    await page.goto('/lavacar-beloauto');
    await expect(page.locator('[data-testid="information-completion-prompt"]')).toBeVisible();

    await page.locator('[data-testid="information-completion-logout"]').click();

    await expect(page).toHaveURL('/lavacar-beloauto');
    await expect(page.locator('[data-testid="hotsite-login-link"]')).toBeVisible();
  });
});
