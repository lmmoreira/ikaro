import { test } from '@playwright/test';
import { runLocalizationCheck, type LocalizationCase } from './helpers/localization';

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
