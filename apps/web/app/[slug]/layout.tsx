import { fetchManifest } from '@/lib/api/platform';
import { applyBranding } from '@/lib/hotsite/apply-branding';
import { FONT_VARIABLES } from '@/lib/hotsite/font-config';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import { FormattingProvider } from '@/providers/formatting-provider';
import { LocaleProvider } from '@/providers/locale-provider';

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
  const { language, currency, timezone, dateFormat, timeFormat } = manifest.localization;
  const locale = resolveSupportedLocale(language ?? 'pt-BR');
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
          dateFormat={dateFormat}
          timeFormat={timeFormat}
        >
          {children}
        </FormattingProvider>
      </LocaleProvider>
    </div>
  );
}
