'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import type { Address, HotsiteAddressSpec } from '@ikaro/types';
import type { AddressLookup } from '@/shared/lib/address/address-lookup.port';
import { viaCepAddressLookup } from '@/shared/lib/address/viacep-address-lookup.adapter';
import { digitsOnly } from '@/shared/utils/digits-only';

interface AddressFieldsProps {
  readonly value: Address;
  readonly onChange: (address: Address) => void;
  readonly idPrefix: string;
  readonly addressSpec: HotsiteAddressSpec;
  readonly addressLookup?: AddressLookup;
  readonly required?: boolean;
  readonly hasError?: boolean;
}

interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly required?: boolean;
  readonly maxLength?: number;
  readonly inputMode?: 'text' | 'numeric';
  readonly placeholder?: string;
  readonly hasError?: boolean;
}

function fieldBorderStyle(hasError: boolean): React.CSSProperties {
  return {
    borderRadius: 'var(--ba-radius)',
    borderColor: hasError ? '#dc2626' : 'var(--ba-secondary)',
    backgroundColor: 'var(--ba-secondary)',
    color: 'var(--ba-text)',
  };
}

function TextField({
  id,
  label,
  value,
  onChange,
  required,
  maxLength,
  inputMode,
  placeholder,
  hasError,
}: TextFieldProps): React.JSX.Element {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-medium"
        style={{ color: 'var(--ba-text)' }}
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        maxLength={maxLength}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border px-3 py-2"
        style={fieldBorderStyle(!!hasError)}
        aria-invalid={hasError ? true : undefined}
      />
    </div>
  );
}

export function AddressFields({
  value,
  onChange,
  idPrefix,
  addressSpec,
  addressLookup = viaCepAddressLookup,
  required = true,
  hasError = false,
}: AddressFieldsProps): React.JSX.Element {
  const t = useTranslations('booking.address');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const lookupSeqRef = useRef(0);

  async function handleZipCodeChange(zipCode: string) {
    onChange({ ...value, zipCode });
    setLookupFailed(false);

    if (addressSpec.lookupService !== 'viacep') return;
    const digits = digitsOnly(zipCode);
    if (digits.length !== 8) return;

    const seq = ++lookupSeqRef.current;
    setIsLookingUp(true);

    try {
      const result = await addressLookup.lookup(digits);
      if (seq !== lookupSeqRef.current) return;

      if (!result) {
        setLookupFailed(true);
        return;
      }

      onChange({ ...value, zipCode, ...result });
    } catch {
      if (seq === lookupSeqRef.current) setLookupFailed(true);
    } finally {
      if (seq === lookupSeqRef.current) setIsLookingUp(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <div className="sm:col-span-2">
        <TextField
          id={`${idPrefix}-zip-code`}
          label={addressSpec.postalLabel}
          value={value.zipCode}
          onChange={handleZipCodeChange}
          placeholder={addressSpec.postalPlaceholder}
          required={required}
          hasError={required && hasError}
        />
        {isLookingUp && (
          <p
            className="mt-1 text-sm opacity-75"
            data-testid="lookup-loading"
            data-id-prefix={idPrefix}
          >
            {t('searching')}
          </p>
        )}
        {lookupFailed && (
          <p
            className="mt-1 text-sm opacity-75"
            data-testid="lookup-failed"
            data-id-prefix={idPrefix}
          >
            {t('notFound')}
          </p>
        )}
      </div>

      <div className="sm:col-span-4">
        <TextField
          id={`${idPrefix}-street`}
          label={addressSpec.streetLabel}
          value={value.street}
          onChange={(street) => onChange({ ...value, street })}
          required={required}
          hasError={required && hasError}
        />
      </div>

      <div className="sm:col-span-2">
        <TextField
          id={`${idPrefix}-number`}
          label={addressSpec.numberLabel}
          value={value.number}
          onChange={(number) => onChange({ ...value, number })}
          required={required}
          hasError={required && hasError}
        />
      </div>

      <div className="sm:col-span-4">
        <TextField
          id={`${idPrefix}-complement`}
          label={addressSpec.complementLabel}
          value={value.complement ?? ''}
          onChange={(complement) => onChange({ ...value, complement })}
        />
      </div>

      {addressSpec.requireNeighborhood && (
        <div className="sm:col-span-3">
          <TextField
            id={`${idPrefix}-neighborhood`}
            label={addressSpec.neighborhoodLabel ?? 'Neighborhood'}
            value={value.neighborhood ?? ''}
            onChange={(neighborhood) => onChange({ ...value, neighborhood })}
            required={required}
            hasError={required && hasError}
          />
        </div>
      )}

      <div className="sm:col-span-2">
        <TextField
          id={`${idPrefix}-city`}
          label={addressSpec.cityLabel}
          value={value.city}
          onChange={(city) => onChange({ ...value, city })}
          required={required}
          hasError={required && hasError}
        />
      </div>

      <div className="sm:col-span-1">
        <TextField
          id={`${idPrefix}-state`}
          label={addressSpec.stateLabel}
          value={value.state}
          onChange={(state) => onChange({ ...value, state })}
          required={required}
          hasError={required && hasError}
        />
      </div>
    </div>
  );
}
