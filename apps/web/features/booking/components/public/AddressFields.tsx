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
  /** The id of the form message that explains the error; every invalid input points to it. */
  readonly describedBy?: string;
  /** Focus target for the form when the address is the first invalid group: the first input. */
  readonly firstFieldRef?: React.Ref<HTMLInputElement>;
}

export function AddressFields({
  value,
  onChange,
  idPrefix,
  addressSpec,
  addressLookup = viaCepAddressLookup,
  required = true,
  hasError = false,
  describedBy,
  firstFieldRef,
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
          inputRef={firstFieldRef}
          label={addressSpec.postalLabel}
          value={value.zipCode}
          onChange={changeZipCode}
          placeholder={addressSpec.postalPlaceholder}
          required={required}
          hasError={hasError}
          describedBy={describedBy}
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
          hasError={hasError}
          describedBy={describedBy}
        />
      </div>

      <div className="sm:col-span-2">
        <AddressTextField
          id={`${idPrefix}-number`}
          label={addressSpec.numberLabel}
          value={value.number}
          onChange={(number) => onChange({ ...value, number })}
          required={required}
          hasError={hasError}
          describedBy={describedBy}
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
            hasError={hasError}
            describedBy={describedBy}
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
          hasError={hasError}
          describedBy={describedBy}
        />
      </div>

      <div className="sm:col-span-1">
        <AddressTextField
          id={`${idPrefix}-state`}
          label={addressSpec.stateLabel}
          value={value.state}
          onChange={(state) => onChange({ ...value, state })}
          required={required}
          hasError={hasError}
          describedBy={describedBy}
        />
      </div>
    </div>
  );
}
