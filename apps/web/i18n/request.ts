import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { getMessages, resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';
import { resolveLocale } from '@/shared/lib/i18n/resolve-locale';

export default getRequestConfig(async () => {
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '/';
  const rawLocale = await resolveLocale(pathname);
  const locale = resolveSupportedLocale(rawLocale);
  const messages = await getMessages(locale);
  return { locale, messages };
});
