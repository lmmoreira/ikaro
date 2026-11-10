import enMessages from '@ikaro/i18n/locales/en/web.json';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';

// A numeric field draws its unit inside the field (ui/number-input), so a label must not
// also carry it in parentheses, and a unit is spelled once, in `common.units`, in both locales.
const LOCALES = { 'pt-BR': ptBRMessages, en: enMessages } as const;

const POLICY_LABEL_KEYS = [
  'politicasDurationMinLabel',
  'politicasDurationMaxLabel',
  'politicasDurationIncrementLabel',
  'politicasPricingIncrementLabel',
  'politicasPricePerIncrementLabel',
  'politicasMinChargeLabel',
  'politicasHoldMinutesLabel',
  'politicasCancellationWindowLabel',
  'politicasRescheduleWindowLabel',
  'politicasMinAdvanceLabel',
  'politicasMaxAdvanceLabel',
  'politicasHorizonLabel',
] as const;

const OPACITY_LABEL_KEYS = [
  'overlayOpacityLabel',
  'overlayFromOpacityLabel',
  'overlayToOpacityLabel',
] as const;

const UNIT_KEYS = [
  'minutes',
  'hours',
  'days',
  'hoursBefore',
  'points',
  'pointsPerCurrency',
  'quantity',
  'people',
  'spots',
  'images',
  'percent',
] as const;

describe.each(Object.entries(LOCALES))('unit labels (%s)', (_locale, messages) => {
  it.each(POLICY_LABEL_KEYS)(
    'the policy label %s does not carry its unit in parentheses',
    (key) => {
      const label = messages.dashboard.servicesPage[key];

      expect(label).not.toMatch(
        /\((minut|min\b|hours?|horas?|days?|dias?|R\$|pts|unid|pessoas|vagas|imagens|%)/i,
      );
    },
  );

  it.each(OPACITY_LABEL_KEYS)('the opacity label %s does not carry a percent sign', (key) => {
    expect(messages.dashboard.hotsitePage.layout.panels.presentation[key]).not.toContain('%');
  });

  it('declares every unit in common.units, and a unit with a currency takes it as a parameter', () => {
    for (const key of UNIT_KEYS) {
      expect(messages.common.units[key]).toEqual(expect.any(String));
      expect(messages.common.units[key]).not.toBe('');
    }
    expect(messages.common.units.pointsPerCurrency).toContain('{currency}');
  });
});
