'use client';

import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { submitGuestBookingInfo, SubmitGuestBookingInfoError } from '@/features/booking/api/public';
import { formatDateLong, formatTime } from '@/shared/lib/formatting/format-time';
import { PhotoUpload } from './PhotoUpload';

export interface SubmitInfoFormSummary {
  readonly serviceSummary: string;
  readonly scheduledAt: string;
  readonly infoRequestMessage: string;
  readonly contactName: string;
}

export interface SubmitInfoFormProps {
  readonly bookingId: string;
  readonly token: string;
  readonly summary: SubmitInfoFormSummary | null;
  readonly brandName?: string;
  readonly brandingStyle?: React.CSSProperties;
  readonly locale?: string;
  readonly timezone?: string;
  readonly timeFormat?: '24h' | '12h';
}

type FormState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly infoSubmittedAt: string }
  | { readonly status: 'error'; readonly kind: 'retry' | 'expired' };

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

export function SubmitInfoForm({
  bookingId,
  token,
  summary,
  brandName,
  brandingStyle,
  locale = 'pt-BR',
  timezone = 'America/Sao_Paulo',
  timeFormat = '24h',
}: SubmitInfoFormProps): React.JSX.Element {
  const t = useTranslations('booking.submitInfo');
  const [response, setResponse] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [validationError, setValidationError] = useState(false);
  const [state, setState] = useState<FormState>({ status: 'idle' });

  function formatScheduledAt(iso: string): string {
    const date = new Date(iso);
    return `${formatDateLong(date, locale)} ${formatTime(date, locale, timezone, timeFormat)}`;
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (response.trim().length < 1) {
      setValidationError(true);
      return;
    }
    setValidationError(false);
    setState({ status: 'submitting' });

    try {
      const result = await submitGuestBookingInfo(bookingId, token, {
        response: response.trim(),
        photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
      });
      setState({ status: 'success', infoSubmittedAt: result.infoSubmittedAt });
    } catch (err) {
      const expired = err instanceof SubmitGuestBookingInfoError && err.status === 401;
      setState({ status: 'error', kind: expired ? 'expired' : 'retry' });
    }
  }

  if (state.status === 'success') {
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
                <dd className="font-semibold">{formatScheduledAt(state.infoSubmittedAt)}</dd>
              </div>
            </dl>
          )}

          <a
            href="/"
            className="mb-4 block border-2 px-8 py-3 text-center font-semibold"
            style={btnStyle}
          >
            {t('goToSiteCta')}
          </a>
          <p className="text-[0.8125rem] leading-relaxed opacity-50">
            <a href="/login" style={{ color: 'var(--ba-primary)' }} className="font-semibold">
              {t('createAccountCta')}
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)', ...brandingStyle }}
    >
      <BrandHeader brandName={brandName} />

      <div className="mx-auto max-w-[560px] px-4 pb-16 pt-6">
        <h1 className="mb-1 text-[1.375rem] font-bold">{t('pageTitle')}</h1>
        {brandName && (
          <p className="mb-5 text-[0.9375rem] opacity-60">
            {t('pageSubtitle', { tenantName: brandName })}
          </p>
        )}

        {summary && (
          <div
            className="mb-5 rounded-md border p-4"
            style={{ borderColor: 'var(--ba-secondary)', borderRadius: 'var(--ba-radius)' }}
          >
            <p className="mb-1 font-bold">{summary.serviceSummary}</p>
            <p className="mb-0.5 text-sm opacity-60">{formatScheduledAt(summary.scheduledAt)}</p>
            <p className="text-sm opacity-50">{summary.contactName}</p>
          </div>
        )}

        {state.status === 'error' && state.kind === 'retry' && (
          <div
            className="mb-5 flex items-start gap-3 rounded-md border p-3.5"
            style={{
              backgroundColor: '#fef2f2',
              borderColor: '#fecaca',
              borderRadius: 'var(--ba-radius)',
            }}
            role="alert"
          >
            <div>
              <p className="mb-1 text-[0.9375rem] font-bold" style={{ color: '#dc2626' }}>
                {t('submitErrorTitle')}
              </p>
              <p className="text-sm" style={{ color: '#7f1d1d' }}>
                {t('submitErrorMessage')}
              </p>
            </div>
          </div>
        )}

        {state.status === 'error' && state.kind === 'expired' && (
          <div
            className="mb-5 flex items-start gap-3 rounded-md border p-3.5"
            style={{
              backgroundColor: '#fef2f2',
              borderColor: '#fecaca',
              borderRadius: 'var(--ba-radius)',
            }}
            role="alert"
          >
            <div>
              <p className="mb-1 text-[0.9375rem] font-bold" style={{ color: '#dc2626' }}>
                {t('submitErrorTitle')}
              </p>
              <p className="text-sm" style={{ color: '#7f1d1d' }}>
                {t('tokenExpiredMessage')}
              </p>
            </div>
          </div>
        )}

        {summary && (
          <div
            className="mb-6 rounded-md border p-4"
            style={{
              backgroundColor: 'var(--ba-secondary)',
              borderColor: 'var(--ba-secondary)',
              borderRadius: 'var(--ba-radius)',
            }}
          >
            <p
              className="mb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide"
              style={{ color: 'var(--ba-primary)' }}
            >
              {t('teamMessageLabel')}
            </p>
            <p className="text-[0.9375rem] leading-relaxed">
              &ldquo;{summary.infoRequestMessage}&rdquo;
            </p>
          </div>
        )}

        {state.status === 'error' && state.kind === 'expired' ? (
          <a
            href="?"
            className="block border-2 px-8 py-3 text-center font-semibold"
            style={btnStyle}
          >
            {t('tokenExpiredCta')}
          </a>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <label htmlFor="response" className="mb-1.5 block text-sm font-semibold">
              {t('responseLabel')} <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <textarea
              id="response"
              data-testid="response-input"
              rows={5}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder={t('responsePlaceholder')}
              aria-invalid={validationError}
              aria-describedby={validationError ? 'response-error' : undefined}
              className="mb-1.5 w-full resize-y rounded-md border p-3 text-sm"
              style={{
                borderColor: validationError ? '#ef4444' : 'var(--ba-secondary)',
                borderRadius: 'var(--ba-radius)',
                minHeight: '7rem',
              }}
              disabled={state.status === 'submitting'}
            />
            {validationError && (
              <p
                id="response-error"
                role="alert"
                className="mb-3 text-sm"
                style={{ color: '#ef4444' }}
              >
                {t('validationError')}
              </p>
            )}

            <div className="mt-4">
              <PhotoUpload
                guestToken={token}
                bookingId={bookingId}
                value={photoUrls}
                onChange={setPhotoUrls}
              />
            </div>

            <button
              type="submit"
              disabled={state.status === 'submitting'}
              className="mt-5 w-full border-2 px-8 py-3.5 text-center font-semibold disabled:opacity-60"
              style={btnStyle}
            >
              {state.status === 'submitting' ? t('submittingButton') : t('submitButton')}
            </button>
          </form>
        )}

        <p className="mt-4 text-center text-xs opacity-45">{t('linkValidityNote')}</p>
      </div>
    </main>
  );
}

function BrandHeader({ brandName }: { readonly brandName?: string }): React.JSX.Element {
  return (
    <header
      className="flex items-center gap-3 border-b px-5 py-3.5"
      style={{ borderColor: 'var(--ba-secondary)' }}
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
        style={{ backgroundColor: 'var(--ba-primary)' }}
        aria-hidden="true"
      >
        {brandName?.charAt(0).toUpperCase() ?? '?'}
      </div>
      {brandName && (
        <span data-testid="brand-name" className="text-base font-bold">
          {brandName}
        </span>
      )}
    </header>
  );
}
