import { createTranslator } from 'next-intl';
import type { HotsiteBusinessInfoResponse } from '@ikaro/types';
import { getMessages, resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';

export interface SeoDefaultsInput {
  // The raw tenant name, not the brand-name-resolved display name: the public <title> never
  // prefers branding.brandName.
  readonly tenantName: string;
  readonly address: HotsiteBusinessInfoResponse['address'];
  // The tenant's localization.language — the language the public site's metadata is built in,
  // which is not necessarily the viewer's own locale.
  readonly language: string;
}

export interface SeoDefaults {
  readonly title: string;
  readonly description: string;
}

// The title/description a hotsite falls back to while its SEO fields are unset. Shared by the
// public <head> (buildHotsiteMetadata) and the editor's sharing simulation, so the two cannot
// drift apart.
export async function resolveSeoDefaults({
  tenantName,
  address,
  language,
}: SeoDefaultsInput): Promise<SeoDefaults> {
  const locale = resolveSupportedLocale(language);
  const messages = (await getMessages(locale)) as IntlMessages;
  const t = createTranslator<IntlMessages, 'seo'>({ locale, messages, namespace: 'seo' });
  const location = address ? `${address.city}, ${address.state}` : null;
  const name = tenantName;
  return {
    title: location
      ? t('defaultTitleWithLocation', { name, location })
      : t('defaultTitle', { name }),
    description: location
      ? t('defaultDescriptionWithLocation', { name, location })
      : t('defaultDescription', { name }),
  };
}
