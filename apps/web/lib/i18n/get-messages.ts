import type { AbstractIntlMessages } from 'next-intl';

const SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
const FALLBACK: SupportedLocale = 'pt-BR';

export async function getMessages(locale: string): Promise<AbstractIntlMessages> {
  const resolved: SupportedLocale = (SUPPORTED_LOCALES as readonly string[]).includes(locale)
    ? (locale as SupportedLocale)
    : FALLBACK;

  if (resolved === 'en') {
    return (
      await import(
        /* webpackChunkName: "locale-en" */
        '@ikaro/i18n/locales/en/web.json'
      )
    ).default as AbstractIntlMessages;
  }

  return (
    await import(
      /* webpackChunkName: "locale-pt-BR" */
      '@ikaro/i18n/locales/pt-BR/web.json'
    )
  ).default as AbstractIntlMessages;
}
