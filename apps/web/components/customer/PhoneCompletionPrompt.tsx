'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { buildContactPhone, digitsOnly } from '@/lib/utils';
import { getHotsiteCustomerProfile, updateHotsiteCustomerProfile } from '@/lib/api/customers';
import { ErrorAlert } from '../booking/ErrorAlert';

interface PhoneCompletionPromptProps {
  readonly phonePrefix: string;
}

type PromptState = 'loading' | 'hidden' | 'visible';

export function PhoneCompletionPrompt({
  phonePrefix,
}: PhoneCompletionPromptProps): React.JSX.Element | null {
  const t = useTranslations('auth');
  const [state, setState] = useState<PromptState>('loading');
  const [rawInput, setRawInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getHotsiteCustomerProfile().then((profile) => {
      if (!active) return;
      setState(profile && profile.phone == null ? 'visible' : 'hidden');
    });
    return () => {
      active = false;
    };
  }, []);

  if (state !== 'visible') return null;

  const localDigits = digitsOnly(rawInput);
  const isValid = localDigits.length === 10 || localDigits.length === 11;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const phone = buildContactPhone(rawInput, phonePrefix);
      await updateHotsiteCustomerProfile({ phone });
      setState('hidden');
    } catch (err) {
      const status =
        err instanceof Error && 'status' in err ? (err as { status: number }).status : 0;
      setError(
        status === 400 ? t('phoneCompletionValidationError') : t('phoneCompletionGenericError'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 pb-4 sm:items-center sm:pb-0"
      data-testid="phone-completion-prompt"
    >
      <div
        className="w-full max-w-sm rounded-t-2xl p-6 sm:rounded-2xl"
        style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
      >
        <h2 className="text-lg font-bold">{t('phoneCompletionHeading')}</h2>
        <p className="mt-1 text-sm opacity-70">{t('phoneCompletionSubtitle')}</p>

        <form onSubmit={handleSubmit} className="mt-5">
          <label htmlFor="phone-completion-input" className="mb-1 block text-sm font-medium">
            {t('phoneCompletionLabel')}
          </label>
          <div className="flex">
            <span
              data-testid="phone-completion-prefix"
              className="flex items-center border border-r-0 px-3 text-sm font-medium"
              style={{
                borderRadius: 'var(--ba-radius) 0 0 var(--ba-radius)',
                borderColor: 'var(--ba-secondary)',
                backgroundColor: 'var(--ba-secondary)',
              }}
            >
              {phonePrefix}
            </span>
            <input
              id="phone-completion-input"
              type="tel"
              inputMode="numeric"
              required
              data-testid="phone-completion-input"
              maxLength={Math.max(1, 15 - digitsOnly(phonePrefix).length)}
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              className="min-w-0 flex-1 border px-3 py-2"
              style={{
                borderRadius: '0 var(--ba-radius) var(--ba-radius) 0',
                borderColor: 'var(--ba-secondary)',
                backgroundColor: 'var(--ba-secondary)',
                color: 'var(--ba-text)',
              }}
            />
          </div>

          {error && (
            <div className="mt-3" data-testid="phone-completion-error">
              <ErrorAlert>{error}</ErrorAlert>
            </div>
          )}

          <button
            type="submit"
            data-testid="phone-completion-submit"
            disabled={!isValid || submitting}
            className="mt-5 w-full border-2 px-6 py-3 font-semibold transition-all disabled:opacity-50"
            style={{
              backgroundColor: 'var(--ba-btn-bg)',
              color: 'var(--ba-btn-text)',
              borderColor: 'var(--ba-btn-border)',
              borderRadius: 'var(--ba-radius)',
            }}
          >
            {t('phoneCompletionSubmit')}
          </button>
        </form>
      </div>
    </div>
  );
}
