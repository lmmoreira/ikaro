'use client';

import type { AbstractIntlMessages } from 'next-intl';
import { NextIntlClientProvider } from 'next-intl';

interface LocaleProviderProps {
  readonly locale: string;
  readonly messages: AbstractIntlMessages;
  readonly children: React.ReactNode;
}

export function LocaleProvider({
  locale,
  messages,
  children,
}: LocaleProviderProps): React.JSX.Element {
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
