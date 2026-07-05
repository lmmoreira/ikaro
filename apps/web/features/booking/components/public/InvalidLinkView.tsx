import { useTranslations } from 'next-intl';
import type React from 'react';

export interface InvalidLinkViewProps {
  readonly reason: 'invalid' | 'processed';
  readonly tenantName?: string;
  readonly tenantSlug?: string;
  readonly brandingStyle?: React.CSSProperties;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

export function InvalidLinkView({
  reason,
  tenantName,
  tenantSlug,
  brandingStyle,
}: InvalidLinkViewProps): React.JSX.Element {
  const t = useTranslations('booking.submitInfo');

  return (
    <main
      data-testid="invalid-link-view"
      className="min-h-screen"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)', ...brandingStyle }}
    >
      <header
        className="flex items-center gap-3 border-b px-5 py-3.5"
        style={{ borderColor: 'var(--ba-secondary)', backgroundColor: 'var(--ba-background)' }}
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
          style={{ backgroundColor: 'var(--ba-primary)' }}
          aria-hidden="true"
        >
          {tenantName?.charAt(0).toUpperCase() ?? '?'}
        </div>
        {tenantName && <span className="text-base font-bold">{tenantName}</span>}
      </header>

      <div className="mx-auto max-w-[480px] px-4 pb-16 pt-12 text-center">
        <div
          className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ backgroundColor: '#fee2e2' }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>

        <h1 className="mb-2 text-[1.375rem] font-bold">{t('invalidTitle')}</h1>

        {reason === 'processed' ? (
          <p className="text-base opacity-70">{t('processedMessage')}</p>
        ) : (
          <>
            <p className="text-[0.9375rem] opacity-60">{t('invalidIntro')}</p>
            <ul
              className="my-6 rounded-md border p-4 text-left text-sm"
              style={{ borderColor: 'var(--ba-secondary)', borderRadius: 'var(--ba-radius)' }}
            >
              <li className="border-b py-1.5" style={{ borderColor: 'var(--ba-secondary)' }}>
                {t('invalidReason1')}
              </li>
              <li className="border-b py-1.5" style={{ borderColor: 'var(--ba-secondary)' }}>
                {t('invalidReason2')}
              </li>
              <li className="border-b py-1.5" style={{ borderColor: 'var(--ba-secondary)' }}>
                {t('invalidReason3')}
              </li>
              <li className="py-1.5">{t('invalidReason4')}</li>
            </ul>
          </>
        )}

        {tenantName && (
          <p className="mb-6 text-sm opacity-60">{t('invalidContactNote', { tenantName })}</p>
        )}

        <a
          href={tenantSlug ? `/${tenantSlug}` : '/'}
          className="inline-block border-2 px-8 py-3 font-semibold"
          style={btnStyle}
        >
          {t('goToSiteCta')}
        </a>

        {tenantSlug && (
          <p className="mt-5 text-[0.8125rem] opacity-45">
            <a
              href={`/${tenantSlug}/login`}
              className="font-semibold"
              style={{ color: 'var(--ba-primary)' }}
            >
              {t('invalidLoginCta')}
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
