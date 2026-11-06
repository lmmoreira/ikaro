import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import type { TenantSettingsResponse } from '@ikaro/types';
import { loginAsStaff } from './helpers/auth';
import { getTenantSettings, toUpdateRequest, updateTenantSettings } from './helpers/platform';

// autospa-premium is not used by any booking/schedule/service e2e spec, so mutating its
// settings here can't desync availability/cancellation assumptions those specs make about
// the much more heavily shared lavacar-beloauto tenant.
const MANAGER_EMAIL = 'admin@autospa.com.br';
const MANAGER_TENANT_SLUG = 'autospa-premium';

async function goToSettings(page: Page): Promise<void> {
  await page.goto('/dashboard/settings');
  await expect(page.getByTestId('settings-submit-desktop')).toBeVisible();
}

test.describe('tenant settings management (MANAGER)', () => {
  let originalSettings: TenantSettingsResponse['settings'];

  test.beforeEach(async ({ page }) => {
    await loginAsStaff(page, MANAGER_EMAIL, MANAGER_TENANT_SLUG);
    originalSettings = (await getTenantSettings(page)).settings;
  });

  test.afterEach(async ({ page }) => {
    // Restore the tenant to its pre-test state — settings are tenant-wide, shared state,
    // unlike a booking/service a test creates for itself.
    await updateTenantSettings(page, toUpdateRequest(originalSettings));
  });

  test('loads the settings page pre-filled with the tenant current values', async ({ page }) => {
    await goToSettings(page);

    await expect(page.getByTestId('settings-name')).toHaveValue('AutoSpa Premium');
    await expect(page.getByTestId('settings-cancellation-window')).toHaveValue(
      String(originalSettings.booking.cancellationWindowHours),
    );
    await expect(page.getByTestId('settings-loyalty-expiry')).toHaveValue(
      String(originalSettings.loyalty.expiryDays),
    );
    await expect(page.getByTestId('settings-country-code')).toHaveText('BR');
  });

  test('edits fields across sections and the new values survive a reload', async ({ page }) => {
    await goToSettings(page);

    await page.getByTestId('settings-cancellation-window').fill('72');
    await page.getByTestId('settings-service-buffer').fill('45');
    await page.getByTestId('settings-loyalty-expiry').fill('200');

    await page.getByTestId('settings-submit-desktop').click();
    await expect(page.getByTestId('form-feedback')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('settings-cancellation-window')).toHaveValue('72');
    await expect(page.getByTestId('settings-service-buffer')).toHaveValue('45');
    await expect(page.getByTestId('settings-loyalty-expiry')).toHaveValue('200');

    // The page is already freshly reloaded here, and this step edits a field the steps above never
    // touched, so its "original value" check still sees the tenant's stored value.
    await test.step('saves the recurring-reservation renewal reminder lead time and shows it after a reload (M23-S21)', async () => {
      const field = page.getByTestId('settings-recurring-renewal-reminder-days');
      await expect(field).toHaveValue(
        String(originalSettings.booking.recurringRenewalReminderDays ?? 7),
      );

      await field.fill('5');
      await page.getByTestId('settings-submit-desktop').click();
      await expect(page.getByTestId('form-feedback')).toBeVisible();

      await page.reload();
      await expect(page.getByTestId('settings-recurring-renewal-reminder-days')).toHaveValue('5');
    });
  });

  test('turns the renewal reminder off with 0 and refuses a value above 30 (M23-S21)', async ({
    page,
  }) => {
    await goToSettings(page);

    const field = page.getByTestId('settings-recurring-renewal-reminder-days');
    await field.fill('31');
    await page.getByTestId('settings-submit-desktop').click();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toBeFocused();
    await expect(page.getByTestId('form-feedback')).toBeHidden();

    await field.fill('0');
    await page.getByTestId('settings-submit-desktop').click();
    await expect(page.getByTestId('form-feedback')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('settings-recurring-renewal-reminder-days')).toHaveValue('0');
  });

  test('auto-fills street/city/state from a valid CEP', async ({ page }) => {
    await goToSettings(page);

    const zip = page.getByTestId('settings-address-zip');
    await zip.fill('30130100');
    await expect(page.getByTestId('settings-address-zip-loading')).toBeHidden({
      timeout: 10_000,
    });

    await expect(page.getByTestId('settings-address-city')).toHaveValue('Belo Horizonte');
    await expect(page.getByTestId('settings-address-state')).toHaveValue('MG');
  });

  test('blocks submit when the loyalty expiry warning is not less than the expiry itself', async ({
    page,
  }) => {
    await goToSettings(page);

    await page.getByTestId('settings-loyalty-expiry').fill('30');
    await page.getByTestId('settings-loyalty-expiry-warning').fill('30');
    await page.getByTestId('settings-submit-desktop').click();

    const warning = page.getByTestId('settings-loyalty-expiry-warning');
    await expect(warning).toHaveAttribute('aria-invalid', 'true');
    await expect(warning).toBeFocused();
    await expect(page.getByTestId('form-feedback')).toBeHidden();
  });

  test('keeps socialLinks null when saving an unrelated field (regression)', async ({ page }) => {
    // Recreates the exact production bug: businessInfo.socialLinks sent as null must not be
    // rejected by the BFF/backend with "expected object, received null".
    await updateTenantSettings(
      page,
      toUpdateRequest({
        ...originalSettings,
        businessInfo: originalSettings.businessInfo
          ? { ...originalSettings.businessInfo, socialLinks: null }
          : undefined,
      }),
    );

    await goToSettings(page);
    await expect(page.getByTestId('settings-social-whatsapp')).toHaveValue('');

    await page.getByTestId('settings-service-buffer').fill('50');
    await page.getByTestId('settings-submit-desktop').click();

    await expect(page.getByTestId('form-feedback')).toContainText('Configurações salvas!');

    const after = await getTenantSettings(page);
    expect(after.settings.businessInfo?.socialLinks).toBeNull();
    expect(after.settings.booking.serviceBufferMinutes).toBe(50);
  });
});

test.describe('tenant settings management (STAFF)', () => {
  test('is redirected away from /dashboard/settings — MANAGER-only route', async ({ page }) => {
    await loginAsStaff(page, 'funcionario@lavacar.com.br', 'lavacar-beloauto');

    await page.goto('/dashboard/settings');

    // Middleware redirects to /dashboard, which itself redirects to the default bookings
    // view — the property that matters is that STAFF never lands on /dashboard/settings.
    await expect(page).not.toHaveURL(/\/dashboard\/settings/);
  });
});
