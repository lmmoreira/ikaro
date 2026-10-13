'use client';

import { useTranslations } from 'next-intl';
import type React from 'react';
import type { Address, HotsiteAddressSpec } from '@ikaro/types';
import type { AddressLookup } from '@/shared/lib/address/address-lookup.port';
import { viaCepAddressLookup } from '@/shared/lib/address/viacep-address-lookup.adapter';
import { useAddressLookup } from '@/features/booking/hooks/useAddressLookup';
import { AddressTextField } from './AddressTextField';

interface AddressFieldsProps {
  readonly value: Address;
  readonly onChange: (address: Address) => void;
  readonly idPrefix: string;
  readonly addressSpec: HotsiteAddressSpec;
  readonly addressLookup?: AddressLookup;
  readonly required?: boolean;
  readonly hasError?: boolean;
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
  const { isLookingUp, lookupFailed, changeZipCode } = useAddressLookup({
    value,
    onChange,
    addressSpec,
    addressLookup,
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
      <div className="sm:col-span-2">
        <AddressTextField
          id={`${idPrefix}-zip-code`}
          label={addressSpec.postalLabel}
          value={value.zipCode}
          onChange={changeZipCode}
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
        <AddressTextField
          id={`${idPrefix}-street`}
          label={addressSpec.streetLabel}
          value={value.street}
          onChange={(street) => onChange({ ...value, street })}
          required={required}
          hasError={required && hasError}
        />
      </div>

      <div className="sm:col-span-2">
        <AddressTextField
          id={`${idPrefix}-number`}
          label={addressSpec.numberLabel}
          value={value.number}
          onChange={(number) => onChange({ ...value, number })}
          required={required}
          hasError={required && hasError}
        />
      </div>

      <div className="sm:col-span-4">
        <AddressTextField
          id={`${idPrefix}-complement`}
          label={addressSpec.complementLabel}
          value={value.complement ?? ''}
          onChange={(complement) => onChange({ ...value, complement })}
        />
      </div>

      {addressSpec.requireNeighborhood && (
        <div className="sm:col-span-3">
          <AddressTextField
            id={`${idPrefix}-neighborhood`}
            label={addressSpec.neighborhoodLabel ?? t('neighborhoodLabel')}
            value={value.neighborhood ?? ''}
            onChange={(neighborhood) => onChange({ ...value, neighborhood })}
            required={required}
            hasError={required && hasError}
          />
        </div>
      )}

      <div className="sm:col-span-2">
        <AddressTextField
          id={`${idPrefix}-city`}
          label={addressSpec.cityLabel}
          value={value.city}
          onChange={(city) => onChange({ ...value, city })}
          required={required}
          hasError={required && hasError}
        />
      </div>

      <div className="sm:col-span-1">
        <AddressTextField
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
