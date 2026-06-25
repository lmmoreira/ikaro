'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import type { Address, HotsiteAddressSpec } from '@ikaro/types';
import { buildContactPhone, digitsOnly } from '@/lib/utils';
import { formatPhoneForDisplay, phonePlaceholder, sanitizePhoneInput } from '@/lib/phone-format';
import { emptyAddress, isAddressFilled, sanitizeAddress } from '@/lib/booking/personal-info';
import {
  getHotsiteCustomerProfile,
  updateHotsiteCustomerProfile,
  UpdateHotsiteCustomerProfileError,
} from '@/lib/api/customers';
import { AddressFields } from '../booking/AddressFields';
import { ErrorAlert } from '../booking/ErrorAlert';

interface InformationCompletionPromptProps {
  readonly phonePrefix: string;
  readonly addressSpec: HotsiteAddressSpec;
}

type PromptState = 'loading' | 'hidden' | 'visible';

export function InformationCompletionPrompt({
  phonePrefix,
  addressSpec,
}: InformationCompletionPromptProps): React.JSX.Element | null {
  const t = useTranslations('auth');
  const [state, setState] = useState<PromptState>('loading');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState<Address>(emptyAddress());
  const [showAddressErrors, setShowAddressErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    getHotsiteCustomerProfile().then((profile) => {
      if (!active) return;
      if (!profile) {
        setState('hidden');
        return;
      }
      if (profile.phone != null) setPhone(profile.phone);
      if (profile.defaultAddress != null) setAddress(profile.defaultAddress);
      setState(profile.phone == null || profile.defaultAddress == null ? 'visible' : 'hidden');
    });
    return () => {
      active = false;
    };
  }, []);

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
      await updateHotsiteCustomerProfile({ phone, defaultAddress: sanitizeAddress(address) });
      setState('hidden');
    } catch (err) {
      if (err instanceof UpdateHotsiteCustomerProfileError) {
        const fields = err.violations.map((v) => v.field);
        if (fields.includes('phone')) {
          setError(t('informationCompletionPhoneError'));
        } else if (fields.some((field) => field.startsWith('defaultAddress'))) {
          setShowAddressErrors(true);
          setError(t('informationCompletionAddressError'));
        } else {
          setError(t('informationCompletionGenericError'));
        }
      } else {
        setError(t('informationCompletionGenericError'));
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
              onChange={setAddress}
              idPrefix="information-completion-address"
              addressSpec={addressSpec}
              hasError={showAddressErrors && !isAddressValid}
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
        </form>
      </div>
    </div>
  );
}
