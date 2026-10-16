// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import enMessages from '@ikaro/i18n/locales/en/web.json';
import { FormattingProvider } from '@/providers/formatting-provider';
import type { DateFormat } from '@ikaro/i18n';
import type { HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import type { PublicEnvKey } from '@/shared/lib/runtime-env/public-env';
import { FloatingFilterDockContext } from '@/features/booking/components/dashboard/floating-filter-dock-context';
import type { FloatingFilterCorner } from '@/features/booking/model/floating-filter-corner';

// getPublicEnv() reads window.__PUBLIC_ENV__ in any jsdom (client-simulated) spec, never
// process.env — mirrors what the root layout's PublicEnvScript injects into real pages (TD29).
// Component specs that render a client-bundle-affecting NEXT_PUBLIC_* consumer must call this
// instead of setting process.env directly; pair with clearPublicEnv() in afterEach.
export function stubPublicEnv(values: Partial<Record<PublicEnvKey, string>>): void {
  window.__PUBLIC_ENV__ = {
    NEXT_PUBLIC_BFF_URL: '',
    NEXT_PUBLIC_SITE_URL: '',
    NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL: '',
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: '',
    ...values,
  };
}

export function clearPublicEnv(): void {
  delete window.__PUBLIC_ENV__;
}

// The booking-flow fields of HotsiteServiceResponse for a plain fixed-duration, LOCATION-only
// service — spread into a spec's own service fixture so each spec keeps its own name/price.
export const hotsiteServiceBookingDefaults: Pick<
  HotsiteServiceResponse,
  'bookingModel' | 'resourceRequirements' | 'legs' | 'bookingPolicy'
> = {
  bookingModel: 'APPOINTMENT',
  resourceRequirements: [{ type: 'LOCATION', selectionMode: 'NONE', requiredQuantity: 1 }],
  legs: null,
  bookingPolicy: {
    effectiveMinBookingAdvanceHours: 0,
    effectiveMaxBookingAdvanceDays: 90,
    durationPolicy: 'FIXED',
    durationMinMinutes: null,
    durationMaxMinutes: null,
    durationIncrementMinutes: null,
    pricingPolicy: 'FIXED',
    pricingIncrementMinutes: null,
    pricePerIncrementAmount: null,
    minimumChargeAmount: null,
    recurrenceEligible: false,
    recurringHorizonDays: null,
    availabilityAlertEligible: false,
  },
};

// The Brazilian address format (CEP, bairro required, ViaCEP lookup) the booking forms are built from.
export const BR_ADDRESS_SPEC: HotsiteAddressSpec = {
  postalLabel: 'CEP',
  postalPlaceholder: '00000-000',
  stateLabel: 'UF',
  requireNeighborhood: true,
  neighborhoodLabel: 'Bairro',
  streetLabel: 'Rua',
  numberLabel: 'Número',
  complementLabel: 'Complemento',
  cityLabel: 'Cidade',
  lookupService: 'viacep',
};

// The inline error of one intake question (its data-testid is static; the key rides in data-field-key).
export function intakeFieldError(fieldKey: string): HTMLElement | null {
  return (
    screen
      .queryAllByTestId('intake-field-error')
      .find((element) => element.dataset.fieldKey === fieldKey) ?? null
  );
}

export function choiceRequirement(
  type: 'STAFF' | 'ROOM' | 'EQUIPMENT',
): HotsiteServiceResponse['resourceRequirements'][number] {
  return { type, selectionMode: 'CUSTOMER_CHOICE', requiredQuantity: 1 };
}

/** A requirement the system resolves every week (`AUTO_ANY` unless a pool is asked for). */
export function autoRequirement(
  type: 'STAFF' | 'ROOM' | 'EQUIPMENT',
  selectionMode: 'AUTO_ANY' | 'AUTO_FUNGIBLE_POOL' = 'AUTO_ANY',
): HotsiteServiceResponse['resourceRequirements'][number] {
  return { type, selectionMode, requiredQuantity: 1 };
}

/** The unrestricted default-location requirement an older service stores (mode `NONE`). */
export function storedLocationRequirement(): HotsiteServiceResponse['resourceRequirements'][number] {
  return { type: 'LOCATION', selectionMode: 'NONE', requiredQuantity: 1 };
}

// A complete HotsiteServiceResponse; `overrides` replace whole fields (booking-flow defaults are a
// plain fixed-duration, LOCATION-only service).
export function makeHotsiteService(
  overrides: Partial<HotsiteServiceResponse> = {},
): HotsiteServiceResponse {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Lavagem Completa',
    description: null,
    price: { amount: 150, currency: 'BRL', formatted: 'R$ 150,00' },
    durationMinutes: 60,
    loyaltyPointsValue: 10,
    requiresPickupAddress: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...hotsiteServiceBookingDefaults,
    ...overrides,
  };
}

const FORMATTING_DEFAULTS: Record<
  string,
  {
    currency: string;
    timezone: string;
    dateFormat: DateFormat;
    timeFormat: '24h' | '12h';
  }
> = {
  'pt-BR': {
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
  },
  en: {
    currency: 'USD',
    timezone: 'America/New_York',
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
  },
};

const MESSAGES: Record<string, AbstractIntlMessages> = {
  'pt-BR': ptBRMessages as AbstractIntlMessages,
  en: enMessages as AbstractIntlMessages,
};

export interface RenderWithIntlOptions {
  readonly locale?: string;
  readonly messages?: AbstractIntlMessages;
  readonly formattingOverrides?: Partial<(typeof FORMATTING_DEFAULTS)[string]>;
  // An extra provider layer inside the intl/formatting ones, kept by `rerender()` like they are.
  readonly contextWrapper?: React.ComponentType<{ readonly children: React.ReactNode }>;
}

export function renderWithIntl(
  ui: React.ReactElement,
  {
    locale = 'pt-BR',
    messages,
    formattingOverrides,
    contextWrapper: ContextWrapper,
  }: RenderWithIntlOptions = {},
): ReturnType<typeof render> {
  const resolvedMessages = messages ?? MESSAGES[locale] ?? (ptBRMessages as AbstractIntlMessages);
  const baseFormatting = FORMATTING_DEFAULTS[locale] ?? FORMATTING_DEFAULTS['pt-BR'];
  const formatting = { locale, ...baseFormatting, ...formattingOverrides };

  // Using RTL's `wrapper` option (rather than manually wrapping `ui` and calling `render()`
  // directly) is what makes the returned `rerender()` keep the intl/formatting providers on a
  // subsequent render — `rerender(newUi)` only re-applies a manually-wrapped tree, it doesn't
  // re-wrap a bare element passed to it.
  function Wrapper({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return (
      <NextIntlClientProvider locale={locale} messages={resolvedMessages}>
        <FormattingProvider {...formatting}>
          {ContextWrapper ? <ContextWrapper>{children}</ContextWrapper> : children}
        </FormattingProvider>
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}

// A FloatingFilterMenu throws outside a FloatingFilterDock (M23-S50), so a menu spec renders it
// inside a fixed-corner dock context — no tenant, no localStorage, no pointer handling to set up.
export function renderWithIntlInFloatingFilterDock(
  ui: React.ReactElement,
  {
    corner = 'bottom-right',
    setCorner = () => undefined,
    isDragging = false,
    ...options
  }: RenderWithIntlOptions & {
    readonly corner?: FloatingFilterCorner;
    readonly setCorner?: (corner: FloatingFilterCorner) => void;
    readonly isDragging?: boolean;
  } = {},
): ReturnType<typeof render> {
  function DockContext({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
    return (
      <FloatingFilterDockContext.Provider
        value={{
          corner,
          setCorner,
          isDragging,
          dragHandlers: {
            onPointerDown: () => undefined,
            onPointerMove: () => undefined,
            onPointerUp: () => undefined,
            onPointerCancel: () => undefined,
            onLostPointerCapture: () => undefined,
            onClickCapture: () => undefined,
          },
        }}
      >
        {children}
      </FloatingFilterDockContext.Provider>
    );
  }
  return renderWithIntl(ui, { ...options, contextWrapper: DockContext });
}

// PillSelect (TD37-S23, Codex review PR #450) shares one static data-testid per option group,
// disambiguated by a separate data-value attribute rather than a computed data-testid — every
// PillSelect-consuming component spec needs the same lookup, so it lives here instead of being
// redefined per file.
export function getPillOption(testId: string, value: string): HTMLElement {
  const match = screen.getAllByTestId(testId).find((el) => el.dataset.value === value);
  if (!match) {
    throw new Error(`No PillSelect option found for testId="${testId}" value="${value}"`);
  }
  return match;
}

export function queryPillOption(testId: string, value: string): HTMLElement | null {
  return screen.queryAllByTestId(testId).find((el) => el.dataset.value === value) ?? null;
}
