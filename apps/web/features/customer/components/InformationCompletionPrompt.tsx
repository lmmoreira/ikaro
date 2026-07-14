'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import type { Address, HotsiteAddressSpec } from '@ikaro/types';
import { buildContactPhone } from '@/shared/utils/contact-phone';
import { digitsOnly } from '@/shared/utils/digits-only';
import {
  formatPhoneForDisplay,
  phonePlaceholder,
  sanitizePhoneInput,
} from '@/shared/utils/phone-format';
import {
  emptyAddress,
  isAddressFilled,
  sanitizeAddress,
} from '@/features/booking/model/personal-info';
import {
  getHotsiteCustomerProfile,
  updateHotsiteCustomerProfile,
  UpdateHotsiteCustomerProfileError,
} from '@/features/platform/hotsite/api/customers';
import { AddressFields } from '@/features/booking/components/public/AddressFields';
import { ErrorAlert } from '@/features/booking/components/public/ErrorAlert';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

interface InformationCompletionPromptProps {
  readonly slug: string;
  readonly phonePrefix: string;
  readonly addressSpec: HotsiteAddressSpec;
}

type PromptState = 'loading' | 'hidden' | 'visible';

export function InformationCompletionPrompt({
  slug,
  phonePrefix,
  addressSpec,
}: InformationCompletionPromptProps): React.JSX.Element | null {
  const t = useTranslations('auth');
  const locale = useResolvedLocale();
  const [state, setState] = useState<PromptState>('loading');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<Address>(emptyAddress());
  const [showAddressErrors, setShowAddressErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getHotsiteCustomerProfile(slug)
      .then((profile) => {
        if (!active) return;
        if (!profile) {
          setState('hidden');
          return;
        }
        if (profile.phone != null) setPhone(profile.phone);
        if (profile.defaultAddress != null) setAddress(profile.defaultAddress);
        setState(profile.phone == null || profile.defaultAddress == null ? 'visible' : 'hidden');
      })
      .catch(() => {
        // On a non-auth upstream error, leave the prompt in 'loading' (invisible) rather than
        // incorrectly hiding it — a 5xx is not the same as "profile is complete".
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (state !== 'visible') return null;

  const localPhoneDigits = phone.startsWith(phonePrefix)
    ? phone.slice(phonePrefix.length)
    : digitsOnly(phone);
  const isPhoneValid = localPhoneDigits.length === 10 || localPhoneDigits.length === 11;
  const isAddressValid = isAddressFilled(address, addressSpec.requireNeighborhood);

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submitting) return;

    if (!isPhoneValid) {
      setShowAddressErrors(false);
      setError(t('informationCompletionPhoneError'));
      return;
    }
    if (!isAddressValid) {
      setShowAddressErrors(true);
      setError(null);
      return;
    }

    setShowAddressErrors(false);
    setSubmitting(true);
    setError(null);
    try {
      await updateHotsiteCustomerProfile(slug, { phone, defaultAddress: sanitizeAddress(address) });
      setState('hidden');
    } catch (err) {
      if (err instanceof UpdateHotsiteCustomerProfileError) {
        const phoneViolation = err.violations.find((v) => v.field === 'phone');
        if (err.field === 'phone' || phoneViolation) {
          setError(resolveErrorMessage(phoneViolation?.code ?? err.code, locale));
        } else if (err.status === 400) {
          // Either a top-level code from a backend domain/VO address validation failure
          // (CustomerAddressValidationError), or a structured defaultAddress.* Zod violation.
          // Both are address issues from the customer's perspective — address is the only
          // other field on this form, so any non-phone 400 is treated as one rather than
          // falling through to a dead-end generic message.
          setShowAddressErrors(true);
          setError(resolveErrorMessage(err.code ?? err.violations[0]?.code, locale));
        } else {
          setError(resolveErrorMessage(undefined, locale));
        }
      } else {
        setError(resolveErrorMessage(undefined, locale));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-black/70 px-4 py-4 backdrop-blur-sm sm:items-center"
      data-testid="information-completion-prompt"
    >
      <div
        className="max-h-full w-full max-w-sm overflow-y-auto rounded-t-2xl p-6 shadow-2xl sm:max-w-2xl sm:rounded-2xl sm:p-8"
        style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
      >
        <h2 className="text-lg font-bold">{t('informationCompletionHeading')}</h2>
        <p className="mt-1 text-sm opacity-70">{t('informationCompletionSubtitle')}</p>

        <form onSubmit={handleSubmit} noValidate className="mt-5">
          <label htmlFor="information-completion-phone" className="mb-1 block text-sm font-medium">
            {t('informationCompletionPhoneLabel')}
          </label>
          <div className="flex">
            <span
              data-testid="information-completion-phone-prefix"
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
              id="information-completion-phone"
              type="tel"
              inputMode="numeric"
              required
              data-testid="information-completion-phone-input"
              placeholder={phonePlaceholder(phonePrefix)}
              value={formatPhoneForDisplay(localPhoneDigits, phonePrefix)}
              onChange={(e) => {
                const input = sanitizePhoneInput(e.target.value, phonePrefix);
                setPhone(buildContactPhone(input, phonePrefix));
              }}
              className="min-w-0 flex-1 border px-3 py-2"
              style={{
                borderRadius: '0 var(--ba-radius) var(--ba-radius) 0',
                borderColor: 'var(--ba-secondary)',
                backgroundColor: 'var(--ba-secondary)',
                color: 'var(--ba-text)',
              }}
            />
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-medium">{t('informationCompletionAddressLabel')}</p>
            <AddressFields
              value={address}
              onChange={(next) => {
                setAddress(next);
                setShowAddressErrors(false);
              }}
              idPrefix="information-completion-address"
              addressSpec={addressSpec}
              hasError={showAddressErrors}
            />
          </div>

          {error && (
            <div className="mt-3" data-testid="information-completion-error">
              <ErrorAlert>{error}</ErrorAlert>
            </div>
          )}

          <button
            type="submit"
            data-testid="information-completion-submit"
            disabled={submitting}
            className="mt-5 w-full border-2 px-6 py-3 font-semibold transition-all disabled:opacity-50"
            style={{
              backgroundColor: 'var(--ba-btn-bg)',
              color: 'var(--ba-btn-text)',
              borderColor: 'var(--ba-btn-border)',
              borderRadius: 'var(--ba-radius)',
            }}
          >
            {t('informationCompletionSubmit')}
          </button>

          <a
            href={`${process.env.NEXT_PUBLIC_BFF_URL}/auth/logout?tenantSlug=${slug}`}
            data-testid="information-completion-logout"
            className="mt-3 block text-center text-sm underline opacity-70"
            style={{ color: 'var(--ba-text)' }}
          >
            {t('signOut')}
          </a>
        </form>
      </div>
    </div>
  );
}
