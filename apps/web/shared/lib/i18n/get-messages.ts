import { resolveSupportedLocale } from '@ikaro/i18n';
import type { AbstractIntlMessages } from 'next-intl';

// The locale rule is shared with the backend's notification copy and template rows, so it lives in
// @ikaro/i18n; re-exported here because every web import goes through this module.
export { SUPPORTED_LOCALES, resolveSupportedLocale } from '@ikaro/i18n';
export type { SupportedLocale } from '@ikaro/i18n';

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
