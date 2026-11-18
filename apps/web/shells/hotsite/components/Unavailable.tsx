import { useTranslations } from 'next-intl';
import type React from 'react';
import { sectionHeadingFont } from '@/features/platform/hotsite/module-styles';

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-primary)',
};

// The reason-neutral message of every unavailable public hotsite page (UC-122, UC-039 A6): an
// unpublished hotsite, a suspended tenant and a disabled lead-form module all read the same, so it
// never reveals why. It is the message only: the top bar belongs to the page, which draws it over
// this component (UnavailablePage, or lead-form/page.tsx when LeadFormWidget swaps its form for it).
// Inherits the tenant's branding via [slug]/layout.tsx's applyBranding() — falls back to
// DEFAULT_HOTSITE_BRANDING for tenants that haven't configured a hotsite yet.
export function Unavailable(): React.JSX.Element {
  const t = useTranslations('hotsite');

  return (
    <main
      data-testid="hotsite-unavailable"
      className="flex min-h-[calc(100vh-3rem)] flex-col items-center justify-center px-6 text-center"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <h1 className="mb-4 text-4xl font-bold" style={headingStyle}>
        {t('unavailable.title')}
      </h1>
      <p className="text-lg">{t('unavailable.body')}</p>
    </main>
  );
}
