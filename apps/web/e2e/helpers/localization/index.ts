import { expect, type Page } from '@playwright/test';

export interface LocalizationCase {
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

// Shared localization journey used by the BR and US Playwright cases. Keeping the flow here
// lets the spec file stay focused on the assertions for each locale variant.
export async function runLocalizationCheck(page: Page, c: LocalizationCase): Promise<void> {
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
  await expect(page.locator(`label[for="contact-address-zip-code"]`)).toHaveText(c.postalLabel);
  const neighborhoodLabel = page.locator('label[for="contact-address-neighborhood"]');
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
