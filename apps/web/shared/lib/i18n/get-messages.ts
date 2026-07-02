import type { AbstractIntlMessages } from 'next-intl';

export const SUPPORTED_LOCALES = ['pt-BR', 'en'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
const FALLBACK: SupportedLocale = 'pt-BR';

export function resolveSupportedLocale(locale: string): SupportedLocale {
  if ((SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
    return locale as SupportedLocale;
  }
  // Region-qualified tags (e.g. 'en-US', 'en-GB') should resolve by primary
  // subtag rather than falling back to the pt-BR default.
  return locale.split('-')[0] === 'en' ? 'en' : FALLBACK;
}

export async function getMessages(locale: string): Promise<AbstractIntlMessages> {
  const resolved = resolveSupportedLocale(locale);

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
