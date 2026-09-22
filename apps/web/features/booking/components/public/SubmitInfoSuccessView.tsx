import { useTranslations } from 'next-intl';
import { BrandHeader } from './BrandHeader';

export interface SubmitInfoFormSummary {
  readonly serviceSummary: string;
  readonly scheduledAt: string;
  readonly infoRequestMessage: string;
  readonly contactName: string;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

interface SubmitInfoSuccessViewProps {
  readonly brandName?: string;
  readonly brandingStyle?: React.CSSProperties;
  readonly summary: SubmitInfoFormSummary | null;
  readonly response: string;
  readonly infoSubmittedAt: string;
  readonly formatScheduledAt: (iso: string) => string;
  readonly tenantSlug?: string;
}

// Extracted from SubmitInfoForm (TD37-S5A) — the post-submit success screen is a fully
// self-contained view, unrelated to the form/photo-upload logic in the default view.
export function SubmitInfoSuccessView({
  brandName,
  brandingStyle,
  summary,
  response,
  infoSubmittedAt,
  formatScheduledAt,
  tenantSlug,
}: SubmitInfoSuccessViewProps): React.JSX.Element {
  const t = useTranslations('booking.submitInfo');

  return (
    <main
      data-testid="submit-info-success"
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--ba-background)',
        color: 'var(--ba-text)',
        ...brandingStyle,
      }}
    >
      <BrandHeader brandName={brandName} />
      <div className="mx-auto max-w-[480px] px-4 pb-16 pt-12 text-center">
        <div
          className="mx-auto mb-5 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full"
          style={{ backgroundColor: '#dcfce7' }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#16a34a"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold">{t('successTitle')}</h1>
        <p className="mb-8 text-[0.9375rem] leading-relaxed opacity-65">{t('successMessage')}</p>

        {summary && (
          <dl
            className="mb-6 space-y-2 rounded-md border p-4 text-left text-sm"
            style={{ borderColor: 'var(--ba-secondary)', borderRadius: 'var(--ba-radius)' }}
          >
            <div className="flex justify-between gap-3">
              <dt className="opacity-60">{t('successServiceLabel')}</dt>
              <dd className="font-semibold">{summary.serviceSummary}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="opacity-60">{t('successDateLabel')}</dt>
              <dd className="font-semibold">{formatScheduledAt(summary.scheduledAt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="opacity-60">{t('successResponseLabel')}</dt>
              <dd className="max-w-[60%] truncate font-semibold">{response}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="opacity-60">{t('successSubmittedLabel')}</dt>
              <dd className="font-semibold">{formatScheduledAt(infoSubmittedAt)}</dd>
            </div>
          </dl>
        )}

        <a
          href={tenantSlug ? `/${tenantSlug}` : '/'}
          className="mb-4 block border-2 px-8 py-3 text-center font-semibold"
          style={btnStyle}
        >
          {t('goToSiteCta')}
        </a>
        {tenantSlug && (
          <p className="text-[0.8125rem] leading-relaxed opacity-50">
            <a
              href={`/${tenantSlug}/login`}
              style={{ color: 'var(--ba-primary)' }}
              className="font-semibold"
            >
              {t('createAccountCta')}
            </a>
          </p>
        )}
      </div>
    </main>
  );
}
