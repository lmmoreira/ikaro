// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { FormattingProvider } from '@/providers/formatting-provider';

// Default pt-BR formatting state for tests — mirrors a standard BR tenant
const DEFAULT_FORMATTING = {
  locale: 'pt-BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  dateFormat: 'DD/MM/YYYY' as const,
  timeFormat: '24h' as const,
};

export interface RenderWithIntlOptions {
  readonly locale?: string;
  readonly messages?: AbstractIntlMessages;
  readonly formatting?: typeof DEFAULT_FORMATTING;
}

export function renderWithIntl(
  ui: React.ReactElement,
  { locale = 'pt-BR', messages, formatting = DEFAULT_FORMATTING }: RenderWithIntlOptions = {},
): ReturnType<typeof render> {
  const resolvedMessages: AbstractIntlMessages = (messages ?? ptBRMessages) as AbstractIntlMessages;

  return render(
    <NextIntlClientProvider locale={locale} messages={resolvedMessages}>
      <FormattingProvider {...formatting}>{ui}</FormattingProvider>
    </NextIntlClientProvider>,
  );
}
