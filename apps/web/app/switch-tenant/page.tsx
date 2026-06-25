import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { decodeJwtPayload } from '@/lib/auth/decode-jwt';
import { fetchManifest } from '@/lib/api/platform';
import { applyBranding } from '@/lib/hotsite/apply-branding';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { SwitchTenantClient } from '@/components/customer/SwitchTenantClient';

// SwitchTenantClient renders with the *current* tenant's hotsite branding AND locale (the
// prototype it's based on, plan/journey/customer/prototypes/login/01-select-tenant.html, is
// shown inside the hotsite visual context) — but this route lives outside the /[slug] tree, so
// neither the --ba-* CSS variables nor the tenant's locale that [slug]/layout.tsx sets up are in
// scope here. The root layout's next-intl config (i18n/request.ts -> resolveLocale) derives
// locale from the URL's first path segment, which for this route is literally "switch-tenant" —
// not a tenant slug — so it always falls back to the global default (pt-BR), regardless of
// which tenant's locale the customer is actually authenticated against. Fetch the tenant's
// manifest once and apply both branding and locale directly, the same way [slug]/layout.tsx
// does, rather than rendering with the wrong tenant's (or no tenant's) styling and language.
export default async function SwitchTenantPage(): Promise<React.JSX.Element> {
  const token = (await cookies()).get('access_token')?.value;
  const { tenantSlug } = token ? decodeJwtPayload(token) : {};

  if (!tenantSlug) {
    return <SwitchTenantClient currentTenantSlug={null} />;
  }

  const manifest = await fetchManifest(tenantSlug);
  const brandingStyles = applyBranding(manifest.branding);
  const locale = resolveSupportedLocale(manifest.localization.language ?? 'pt-BR');
  const messages = await getMessages(locale);

  return (
    <div style={brandingStyles}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <SwitchTenantClient currentTenantSlug={tenantSlug} />
      </NextIntlClientProvider>
    </div>
  );
}
