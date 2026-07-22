// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import enMessages from '@ikaro/i18n/locales/en/web.json';
import { FormattingProvider } from '@/providers/formatting-provider';
import type { DateFormat } from '@ikaro/i18n';
import type { PublicEnvKey } from '@/shared/lib/runtime-env/public-env';

// getPublicEnv() reads window.__PUBLIC_ENV__ in any jsdom (client-simulated) spec, never
// process.env — mirrors what the root layout's PublicEnvScript injects into real pages (TD29).
// Component specs that render a client-bundle-affecting NEXT_PUBLIC_* consumer must call this
// instead of setting process.env directly; pair with clearPublicEnv() in afterEach.
export function stubPublicEnv(values: Partial<Record<PublicEnvKey, string>>): void {
  window.__PUBLIC_ENV__ = {
    NEXT_PUBLIC_BFF_URL: '',
    NEXT_PUBLIC_SITE_URL: '',
    NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL: '',
    ...values,
  };
}

export function clearPublicEnv(): void {
  delete window.__PUBLIC_ENV__;
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
}

export function renderWithIntl(
  ui: React.ReactElement,
  { locale = 'pt-BR', messages, formattingOverrides }: RenderWithIntlOptions = {},
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
        <FormattingProvider {...formatting}>{children}</FormattingProvider>
      </NextIntlClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}
