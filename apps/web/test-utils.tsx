// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import enMessages from '@ikaro/i18n/locales/en/web.json';
import { FormattingProvider } from '@/providers/formatting-provider';
import type { DateFormat } from '@ikaro/i18n';

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
