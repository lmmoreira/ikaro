import { fetchManifest } from '@/lib/api/platform';
import { applyBranding } from '@/lib/hotsite/apply-branding';
import { FONT_VARIABLES } from '@/lib/hotsite/font-config';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { isValidTimezone, resolveDateFormat } from '@/lib/formatting/locale-validators';
import { FormattingProvider } from '@/providers/formatting-provider';
import { LocaleProvider } from '@/providers/locale-provider';
import { InformationCompletionPrompt } from '@/components/customer/InformationCompletionPrompt';

interface HotsiteLayoutProps {
  readonly children: React.ReactNode;
  readonly params: Promise<{ readonly slug: string }>;
}

export default async function HotsiteLayout({
  children,
  params,
}: HotsiteLayoutProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  const {
    language,
    currency,
    timezone: rawTimezone,
    dateFormat,
    timeFormat,
    phonePrefix,
    address: addressSpec,
  } = manifest.localization;
  const locale = resolveSupportedLocale(language ?? 'pt-BR');
  // Defensive fallback: reconstitute() skips timezone validation; guard before passing to Intl
  const timezone = isValidTimezone(rawTimezone) ? rawTimezone : 'UTC';
  const resolvedDateFormat = resolveDateFormat(dateFormat);
  const messages = await getMessages(locale);
  const brandingStyles = applyBranding(manifest.branding);

  return (
    <div
      id="hotsite-root"
      style={{ ...brandingStyles, fontFamily: 'var(--ba-body-font)' }}
      className={FONT_VARIABLES.join(' ')}
    >
      <LocaleProvider locale={locale} messages={messages}>
        <FormattingProvider
          locale={locale}
          currency={currency}
          timezone={timezone}
          dateFormat={resolvedDateFormat}
          timeFormat={timeFormat}
        >
          <InformationCompletionPrompt
            slug={slug}
            phonePrefix={phonePrefix}
            addressSpec={addressSpec}
          />
          {children}
        </FormattingProvider>
      </LocaleProvider>
    </div>
  );
}
