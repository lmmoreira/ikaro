import { test, expect, type Page } from '@playwright/test';

// TD02-S09 — closes the E2E gap flagged in TD02-S07: confirms the full localization stack
// (currency, date/weekday formatting, phone prefix, address field labels, <html lang>) works
// end-to-end for both a BR tenant (lavacar-beloauto, seeded pt-BR/BRL) and the US tenant
// (ikaro, seeded en/USD — see apps/backend/src/shared/database/seed.ts).
//
// All elements are located by data-testid or a stable, non-translated `id`/`idPrefix`
// (never by translated text) — translated copy is only ever asserted as content, never
// used as the selector, per the project's E2E convention.
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
  postalLabel: 'ZIP Code',
  neighborhoodLabel: null,
};

// AddressFields is mounted with idPrefix="contact-address" by PersonalInfoStep.
const ADDRESS_ID_PREFIX = 'contact-address';

async function runLocalizationCheck(page: Page, c: LocalizationCase): Promise<void> {
  await page.goto(`/${c.slug}`);
  await expect(page.locator('html')).toHaveAttribute('lang', c.htmlLang);
  // price-badge lives on the hotsite's ServiceListModule, not the booking flow's service cards.
  await expect(page.locator('[data-testid="price-badge"]').first()).toContainText(c.currencySymbol);

  await page.goto(`/${c.slug}/booking`);
  await expect(page.locator('[data-testid="step-service-selection"]')).toBeVisible();

  // Step 1 → 2: service selection advances to the day/slot picker.
  await page.locator('[data-testid="service-card"][data-requires-pickup="false"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  // Weekday abbreviation on the 2nd carousel day (index 0 is the translated "Today" label).
  // dayCarouselLabel() (lib/formatting/date-utils.ts) parses/formats in the browser's local
  // timezone (no explicit UTC) — match that here, unlike the UTC-explicit check below for
  // formatDateLong(), which the app itself always pins to 'UTC'.
  const secondDay = page.locator('[data-testid="day-option"]').nth(1);
  const secondDayIso = await secondDay.getAttribute('data-date');
  expect(secondDayIso).not.toBeNull();
  const expectedWeekday = new Intl.DateTimeFormat(c.intlLocale, { weekday: 'short' }).format(
    new Date(`${secondDayIso}T00:00:00`),
  );
  await expect(secondDay).toContainText(expectedWeekday);

  const selectedDay = page.locator('[data-testid="day-option"]:not([disabled])').first();
  const selectedDayIso = await selectedDay.getAttribute('data-date');
  expect(selectedDayIso).not.toBeNull();
  await selectedDay.click();
  await page.locator('[data-testid="time-slot"]').first().click();
  await page.locator('[data-testid="step-next"]').click();

  // Step 3: personal info — phone prefix and country-specific address fields.
  await expect(page.locator('[data-testid="phone-prefix"]')).toHaveText(c.phonePrefix);
  await page.locator('[data-testid="input-name"]').fill(c.contactName);
  await page.locator('[data-testid="input-email"]').fill(c.contactEmail);
  await page.locator('[data-testid="input-phone"]').fill('9999999');

  await page.locator('[data-testid="toggle-contact-address"]').click();
  await expect(page.locator(`label[for="${ADDRESS_ID_PREFIX}-zip-code"]`)).toHaveText(
    c.postalLabel,
  );
  const neighborhoodLabel = page.locator(`label[for="${ADDRESS_ID_PREFIX}-neighborhood"]`);
  if (c.neighborhoodLabel) {
    await expect(neighborhoodLabel).toHaveText(c.neighborhoodLabel);
  } else {
    await expect(neighborhoodLabel).toHaveCount(0);
  }

  // Step 4: confirmation — the long-form locale date for the day selected above.
  // formatDateLong() (lib/formatting/format-time.ts) upper-cases the first letter — match that.
  await page.locator('[data-testid="step-next"]').click();
  const rawDateLong = new Intl.DateTimeFormat(c.intlLocale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${selectedDayIso}T00:00:00Z`));
  const expectedDateLong = rawDateLong.charAt(0).toUpperCase() + rawDateLong.slice(1);
  await expect(page.locator('[data-testid="confirmation-datetime"]')).toContainText(
    expectedDateLong,
  );
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
