import { getRequestConfig } from 'next-intl/server';
import { headers } from 'next/headers';
import { getMessages } from '@/lib/i18n/get-messages';
import { resolveLocale } from '@/lib/i18n/resolve-locale';

export default getRequestConfig(async () => {
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') ?? '/';
  const locale = await resolveLocale(pathname);
  const messages = await getMessages(locale);
  return { locale, messages };
});
