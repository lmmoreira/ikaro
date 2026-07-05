export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
export type TimeFormat = '24h' | '12h';

export interface AddressSpec {
  /** Country-specific postal system label — e.g. 'CEP', 'ZIP Code', 'Postcode'. Not translated. */
  readonly postalLabel: string;
  /** Country-specific postal format example — e.g. '00000-000', '90210'. */
  readonly postalPlaceholder: string;
  /** Validation regex for the postal code. null = accept any string. Never put this in JSON. */
  readonly postalRegex: RegExp | null;
  /** Country-specific state/region label — e.g. 'UF', 'State', 'County'. Not translated. */
  readonly stateLabel: string;
  /** Max character length for state/region code. null = unconstrained. */
  readonly stateMaxLen: number | null;
  /** Validation regex for state/region code. null = unconstrained. Never put in JSON. */
  readonly statePattern: RegExp | null;
  /** Whether this country's address model includes a neighbourhood / bairro concept. */
  readonly requireNeighborhood: boolean;
  /** Country-specific neighbourhood label. null when requireNeighborhood is false. */
  readonly neighborhoodLabel: string | null;
  /** Country-specific street label — e.g. 'Rua', 'Street'. Not translated. */
  readonly streetLabel: string;
  /** Country-specific house/unit number label — e.g. 'Número', 'Number'. Not translated. */
  readonly numberLabel: string;
  /** Country-specific complement/unit label — e.g. 'Complemento', 'Apt, Suite, etc.'. Not translated. */
  readonly complementLabel: string;
  /** Country-specific city label — e.g. 'Cidade', 'City'. Not translated. */
  readonly cityLabel: string;
  /** Postal-code lookup service available for this country. */
  readonly lookupService: 'viacep' | 'none';
}

export interface CountrySpec {
  /** ISO 4217 currency code — default for tenants in this country. */
  readonly currency: string;
  /** BCP-47 language tag — default for tenants in this country. */
  readonly language: string;
  /** E.164 country dialing prefix — e.g. '+55', '+1'. */
  readonly phonePrefix: string;
  /** IANA timezone — best-guess default for provisioning; tenant should always set explicitly. */
  readonly defaultTimezone: string;
  /** Curated IANA timezone options for this country's settings-form dropdown. Not the full
   *  IANA list — a short, relevant set per country (Intl.supportedValuesOf('timeZone') would
   *  return ~400 zones with no country filter, which is worse UX for a single-country form). */
  readonly timezones: readonly string[];
  /** Short date order — drives display formatting across emails and web. */
  readonly dateFormat: DateFormat;
  /** 24-hour vs 12-hour (AM/PM) clock — drives slot display in emails and web. */
  readonly timeFormat: TimeFormat;
  /** Decimal/thousands separator convention — '1.234,56' (BR) vs '1,234.56' (US). */
  readonly numberFormat: '1.234,56' | '1,234.56';
  /** 0 = Sunday, 1 = Monday — drives calendar week-start rendering. */
  readonly firstDayOfWeek: 0 | 1;
  /** Address layout and validation rules — country-specific, not translated. */
  readonly address: AddressSpec;
}

const REGISTRY: Readonly<Record<string, CountrySpec>> = {
  BR: {
    currency: 'BRL',
    language: 'pt-BR',
    phonePrefix: '+55',
    defaultTimezone: 'America/Sao_Paulo',
    timezones: [
      'America/Sao_Paulo',
      'America/Fortaleza',
      'America/Manaus',
      'America/Rio_Branco',
      'America/Noronha',
    ],
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    numberFormat: '1.234,56',
    firstDayOfWeek: 0,
    address: {
      postalLabel: 'CEP',
      postalPlaceholder: '00000-000',
      postalRegex: /^\d{5}-?\d{3}$/,
      stateLabel: 'UF',
      stateMaxLen: 2,
      statePattern: /^[A-Z]{2}$/,
      requireNeighborhood: true,
      neighborhoodLabel: 'Bairro',
      streetLabel: 'Rua',
      numberLabel: 'Número',
      complementLabel: 'Complemento',
      cityLabel: 'Cidade',
      lookupService: 'viacep',
    },
  },

  US: {
    currency: 'USD',
    language: 'en',
    phonePrefix: '+1',
    defaultTimezone: 'America/New_York',
    timezones: [
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Anchorage',
      'Pacific/Honolulu',
    ],
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    numberFormat: '1,234.56',
    firstDayOfWeek: 0,
    address: {
      postalLabel: 'ZIP Code',
      postalPlaceholder: '90210',
      postalRegex: /^\d{5}(-\d{4})?$/,
      stateLabel: 'State',
      stateMaxLen: 2,
      statePattern: /^[A-Z]{2}$/,
      requireNeighborhood: false,
      neighborhoodLabel: null,
      streetLabel: 'Street',
      numberLabel: 'Number',
      complementLabel: 'Apt, Suite, etc.',
      cityLabel: 'City',
      lookupService: 'none',
    },
  },
};

const FALLBACK: CountrySpec = {
  currency: 'USD',
  language: 'en',
  phonePrefix: '+1',
  defaultTimezone: 'UTC',
  timezones: ['UTC'],
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  numberFormat: '1,234.56',
  firstDayOfWeek: 1,
  address: {
    postalLabel: 'Postal Code',
    postalPlaceholder: '',
    postalRegex: null,
    stateLabel: 'State/Province',
    stateMaxLen: null,
    statePattern: null,
    requireNeighborhood: false,
    neighborhoodLabel: null,
    streetLabel: 'Street',
    numberLabel: 'Number',
    complementLabel: 'Complement',
    cityLabel: 'City',
    lookupService: 'none',
  },
};

/** Returns the CountrySpec for the given ISO 3166-1 alpha-2 code, or FALLBACK for unknown codes. */
export function countrySpec(code: string): CountrySpec {
  return REGISTRY[code.toUpperCase()] ?? FALLBACK;
}
