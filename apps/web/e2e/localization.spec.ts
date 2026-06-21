import { test, expect, type Page } from '@playwright/test';

// TD02-S09 — closes the E2E gap flagged in TD02-S07: confirms the full localization stack
// (currency, date/weekday formatting, phone prefix, address field labels, <html lang>) works
// end-to-end for both a BR tenant (lavacar-beloauto, seeded pt-BR/BRL) and the US tenant
// (ikaro, seeded en/USD — see apps/backend/src/shared/database/seed.ts).
//
// formatDate()'s literal DD/MM/YYYY vs MM/DD/YYYY numeric output has no UI consumer yet
// (only formatDateLong's weekday+month-name form is rendered), so date-locale coverage here
// asserts against the actually-rendered weekday/month-name text instead of a numeric pattern.

interface LocalizationCase {
  readonly slug: string;
  readonly htmlLang: string;
  readonly intlLocale: string;
  readonly currencySymbol: string;
  readonly contactName: string;
  readonly contactEmail: string;
  readonly phonePrefix: string;
  readonly addressToggleLabel: string;
  readonly postalLabel: string;
  readonly neighborhoodLabel: string | null;
}

const BR: LocalizationCase = {
  slug: 'lavacar-beloauto',
  htmlLang: 'pt-BR',
  intlLocale: 'pt-BR',
  currencySymbol: 'R$',
  contactName: 'Cliente E2E',
  contactEmail: 'e2e@teste.com.br',
  phonePrefix: '+55',
  addressToggleLabel: 'Endereço de contato (opcional)',
  postalLabel: 'CEP',
  neighborhoodLabel: 'Bairro',
};

const US: LocalizationCase = {
  slug: 'ikaro',
  htmlLang: 'en',
  intlLocale: 'en',
  currencySymbol: '$',
  contactName: 'E2E Customer',
  contactEmail: 'e2e@test.com',
  phonePrefix: '+1',
  addressToggleLabel: 'Contact address (optional)',
  postalLabel: 'ZIP Code',
  neighborhoodLabel: null,
};

async function runLocalizationCheck(page: Page, c: LocalizationCase): Promise<void> {
  await page.goto(`/${c.slug}`);
  await expect(page.locator('html')).toHaveAttribute('lang', c.htmlLang);

  await page.goto(`/${c.slug}/booking`);
  await expect(page.locator('[data-testid="step-service-selection"]')).toBeVisible();
  await expect(page.locator('[data-testid="price-badge"]').first()).toContainText(c.currencySymbol);

  // Step 1 → 2: service selection advances to the day/slot picker.
  await page.locator('[data-testid="service-card"][data-requires-pickup="false"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  // Weekday abbreviation on the 2nd carousel day (index 0 is the translated "Today" label).
  const secondDay = page.locator('[data-testid="day-option"]').nth(1);
  const secondDayIso = await secondDay.getAttribute('data-date');
  const expectedWeekday = new Intl.DateTimeFormat(c.intlLocale, { weekday: 'short' }).format(
    new Date(`${secondDayIso}T00:00:00`),
  );
  await expect(secondDay).toContainText(expectedWeekday);

  const selectedDay = page.locator('[data-testid="day-option"]:not([disabled])').first();
  const selectedDayIso = await selectedDay.getAttribute('data-date');
  await selectedDay.click();
  await page.locator('[data-testid="time-slot"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  // Step 3: personal info — phone prefix and country-specific address fields.
  await expect(page.getByText(c.phonePrefix, { exact: true })).toBeVisible();
  await page.locator('[data-testid="input-name"]').fill(c.contactName);
  await page.locator('[data-testid="input-email"]').fill(c.contactEmail);
  await page.locator('[data-testid="input-phone"]').fill('9999999');

  await page.getByRole('button', { name: c.addressToggleLabel }).click();
  await expect(page.getByLabel(c.postalLabel)).toBeVisible();
  if (c.neighborhoodLabel) {
    await expect(page.getByLabel(c.neighborhoodLabel)).toBeVisible();
  } else {
    await expect(page.getByLabel('Bairro')).not.toBeVisible();
    await expect(page.getByLabel('Neighborhood')).not.toBeVisible();
  }

  // Step 4: confirmation — the long-form locale date for the day selected above.
  await page.locator('[data-testid="step-next"]').click();
  const expectedDateLong = new Intl.DateTimeFormat(c.intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${selectedDayIso}T00:00:00Z`));
  await expect(page.getByText(expectedDateLong, { exact: false })).toBeVisible();
}

test.describe('TD02-S09 — BR tenant localization (lavacar-beloauto)', () => {
  test('renders pt-BR/BRL/CEP+Bairro across the hotsite and booking flow', async ({ page }) => {
    await runLocalizationCheck(page, BR);
  });
});

test.describe('TD02-S09 — US tenant localization (ikaro)', () => {
  test('renders en/USD/ZIP Code with no neighborhood across the hotsite and booking flow', async ({
    page,
  }) => {
    await runLocalizationCheck(page, US);
  });
});
