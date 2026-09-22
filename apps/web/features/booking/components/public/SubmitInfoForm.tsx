'use client';

import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import type { TimeFormat } from '@ikaro/i18n';
import { BffErrorCode } from '@ikaro/types';
import { submitGuestBookingInfo } from '@/features/booking/api/public';
import { formatDateLong, formatTime } from '@/shared/lib/formatting/format-time';
import { resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { extractProblemDetailShape } from '@/shared/lib/api/errors';
import { BrandHeader } from './BrandHeader';
import { PhotoUpload } from './PhotoUpload';
import { SubmitInfoSuccessView, type SubmitInfoFormSummary } from './SubmitInfoSuccessView';

export type { SubmitInfoFormSummary } from './SubmitInfoSuccessView';

const EXPIRED_LINK_CODES: ReadonlySet<string> = new Set([
  BffErrorCode.GUEST_TOKEN_INVALID,
  BffErrorCode.GUEST_TOKEN_MISSING,
  BffErrorCode.GUEST_TOKEN_BOOKING_MISMATCH,
]);

export interface SubmitInfoFormProps {
  readonly bookingId: string;
  readonly token: string;
  readonly summary: SubmitInfoFormSummary | null;
  readonly brandName?: string;
  readonly brandingStyle?: React.CSSProperties;
  readonly locale?: string;
  readonly timezone?: string;
  readonly timeFormat?: TimeFormat;
  readonly tenantSlug?: string;
}

type FormState =
  | { readonly status: 'idle' }
  | { readonly status: 'submitting' }
  | { readonly status: 'success'; readonly infoSubmittedAt: string }
  | { readonly status: 'error'; readonly kind: 'retry' | 'expired'; readonly message: string };

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
  tenantSlug,
}: SubmitInfoFormProps): React.JSX.Element {
  const t = useTranslations('booking.submitInfo');
  const resolvedLocale = resolveSupportedLocale(locale);
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
      const code = extractProblemDetailShape(err)?.code;
      const expired = code !== undefined && EXPIRED_LINK_CODES.has(code);
      setState({
        status: 'error',
        kind: expired ? 'expired' : 'retry',
        message: resolveErrorMessage(code, resolvedLocale),
      });
    }
  }

  if (state.status === 'success') {
    return (
      <SubmitInfoSuccessView
        brandName={brandName}
        brandingStyle={brandingStyle}
        summary={summary}
        response={response}
        infoSubmittedAt={state.infoSubmittedAt}
        formatScheduledAt={formatScheduledAt}
        tenantSlug={tenantSlug}
      />
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

        {state.status === 'error' && (
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
                {state.message}
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
              {t('responseLabel')}{' '}
              <span aria-hidden="true" style={{ color: '#ef4444' }}>
                *
              </span>
            </label>
            <textarea
              id="response"
              data-testid="response-input"
              rows={5}
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              placeholder={t('responsePlaceholder')}
              aria-required="true"
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
              data-testid="submit-button"
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
