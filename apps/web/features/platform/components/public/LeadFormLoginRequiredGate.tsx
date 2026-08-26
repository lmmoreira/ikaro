import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface LeadFormLoginRequiredGateProps {
  readonly slug: string;
}

const primaryBtnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

// UC-040 A1 — audienceMode === 'CUSTOMER_ONLY' and the visitor is unauthenticated. No existing
// reusable "login required" component to extend (story-discovery, M20-S09). Links to /[slug]/login
// with a returnTo pointing back at this same page — see docs/24-BFF_ARCHITECTURE.md § OAuth state
// returnTo.
export function LeadFormLoginRequiredGate({
  slug,
}: LeadFormLoginRequiredGateProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const returnTo = `/${slug}/lead-form`;

  return (
    <div className="mx-auto max-w-lg px-6 py-12" data-testid="lead-form-login-required">
      <div
        className="p-6"
        style={{ backgroundColor: 'var(--ba-secondary)', borderRadius: 'var(--ba-radius)' }}
      >
        <h1 className="text-xl font-bold" style={{ color: 'var(--ba-text)' }}>
          {t('leadForm.loginRequiredTitle')}
        </h1>
        <p className="mt-3 leading-relaxed opacity-70" style={{ color: 'var(--ba-text)' }}>
          {t('leadForm.loginRequiredBody')}
        </p>
      </div>
      <div
        className="mt-4 bg-blue-50 p-6"
        style={{ borderRadius: 'var(--ba-radius)', color: 'var(--ba-text)' }}
      >
        <p className="font-semibold">{t('leadForm.loginRequiredWhyTitle')}</p>
        <p className="mt-1.5 text-sm opacity-70">{t('leadForm.loginRequiredWhyBody')}</p>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href={`/${slug}`}
          data-testid="lead-form-login-required-back"
          className="border px-6 py-3"
          style={{
            borderRadius: 'var(--ba-radius)',
            borderColor: 'var(--ba-secondary)',
            color: 'var(--ba-text)',
          }}
        >
          {t('leadForm.backToSiteButton')}
        </Link>
        <Link
          href={`/${slug}/login?returnTo=${encodeURIComponent(returnTo)}`}
          data-testid="lead-form-login-required-cta"
          className="border-2 px-8 py-3 font-semibold transition-all hover:opacity-90"
          style={primaryBtnStyle}
        >
          {t('leadForm.loginRequiredCta')}
        </Link>
      </div>
    </div>
  );
}
