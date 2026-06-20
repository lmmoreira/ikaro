import { fetchManifest } from '@/lib/api/platform';
import { applyBranding } from '@/lib/hotsite/apply-branding';
import { FONT_VARIABLES } from '@/lib/hotsite/font-config';
import { getMessages, resolveSupportedLocale } from '@/lib/i18n/get-messages';
import type { DateFormat } from '@/lib/booking/format-time';
import { FormattingProvider } from '@/providers/formatting-provider';
import { LocaleProvider } from '@/providers/locale-provider';

const DATE_FORMATS = new Set<DateFormat>(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']);
function resolveDateFormat(fmt: string): DateFormat {
  return DATE_FORMATS.has(fmt as DateFormat) ? (fmt as DateFormat) : 'DD/MM/YYYY';
}

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

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
  const { language, currency, timezone: rawTimezone, dateFormat, timeFormat } = manifest.localization;
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
          {children}
        </FormattingProvider>
      </LocaleProvider>
    </div>
  );
}
