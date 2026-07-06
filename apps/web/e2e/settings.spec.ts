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
    await expect(page.getByTestId('settings-saved-banner')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('settings-cancellation-window')).toHaveValue('72');
    await expect(page.getByTestId('settings-service-buffer')).toHaveValue('45');
    await expect(page.getByTestId('settings-loyalty-expiry')).toHaveValue('200');
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

  test('shows the not-found message for a CEP with no match and still allows manual entry', async ({
    page,
  }) => {
    await goToSettings(page);

    const zip = page.getByTestId('settings-address-zip');
    await zip.fill('00000000');
    await expect(page.getByTestId('settings-address-zip-not-found')).toBeVisible({
      timeout: 10_000,
    });

    await page.getByTestId('settings-address-street').fill('Rua Teste');
    await page.getByTestId('settings-address-number').fill('100');
    await page.getByTestId('settings-address-neighborhood').fill('Centro');
    await page.getByTestId('settings-address-city').fill('Belo Horizonte');
    await page.getByTestId('settings-address-state').fill('MG');

    await page.getByTestId('settings-submit-desktop').click();
    await expect(page.getByTestId('settings-saved-banner')).toBeVisible();
  });

  test('blocks submit when the loyalty expiry warning is not less than the expiry itself', async ({
    page,
  }) => {
    await goToSettings(page);

    await page.getByTestId('settings-loyalty-expiry').fill('30');
    await page.getByTestId('settings-loyalty-expiry-warning').fill('30');
    await page.getByTestId('settings-submit-desktop').click();

    await expect(page.getByTestId('settings-loyalty-expiry-warning-error')).toBeVisible();
  });

  test('blocks submit on a partially-filled address (all-or-nothing)', async ({ page }) => {
    await goToSettings(page);

    await page.getByTestId('settings-address-street').fill('Rua Incompleta');
    // zipCode/number/city/state left blank on purpose.
    await page.getByTestId('settings-submit-desktop').click();

    await expect(page.getByTestId('settings-address-zip-error')).toBeVisible();
  });

  test("Monday's copy button applies its hours to Tue-Fri but not Sat/Sun", async ({ page }) => {
    await goToSettings(page);

    // The original Saturday open-hour, read from the API snapshot (not scraped from the DOM
    // before the action) — the source of truth for "did the copy leave Saturday alone".
    const saturdayHourExpected = originalSettings.businessHours.saturday?.open.split(':')[0] ?? '';

    function dayOpenHour(day: string) {
      return page.locator(`[data-testid="settings-day-open-hour"][data-row-key="${day}"]`);
    }

    // TimePicker is a Radix Select (combobox), not a native <select> — open + pick the option.
    await dayOpenHour('monday').click();
    await page.getByRole('option', { name: '07', exact: true }).click();
    await page.getByTestId('day-copy-monday').click();

    await expect(dayOpenHour('tuesday')).toHaveText('07');
    await expect(dayOpenHour('friday')).toHaveText('07');
    await expect(dayOpenHour('saturday')).toHaveText(saturdayHourExpected);
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

    await expect(page.getByTestId('settings-saved-banner')).toBeVisible();
    await expect(page.getByTestId('settings-submit-error')).not.toBeVisible();

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
