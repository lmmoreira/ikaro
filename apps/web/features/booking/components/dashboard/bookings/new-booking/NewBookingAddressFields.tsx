'use client';

import { useTranslations } from 'next-intl';
import type { Address, HotsiteAddressSpec } from '@ikaro/types';
import { useAddressLookup } from '@/features/booking/hooks/useAddressLookup';
import type { AddressLookup } from '@/shared/lib/address/address-lookup.port';
import { viaCepAddressLookup } from '@/shared/lib/address/viacep-address-lookup.adapter';
import { INPUT_CLASS, LABEL_CLASS } from './new-booking-styles';

interface NewBookingAddressFieldsProps {
  readonly value: Address;
  readonly onChange: (address: Address) => void;
  readonly addressSpec: HotsiteAddressSpec;
  readonly addressLookup?: AddressLookup;
  readonly hasError?: boolean;
}

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly required?: boolean;
  readonly hasError?: boolean;
  readonly placeholder?: string;
  readonly className?: string;
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  hasError,
  placeholder,
  className,
}: FieldProps): React.JSX.Element {
  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL_CLASS}>
        {label}
      </label>
      <input
        id={id}
        className={INPUT_CLASS}
        value={value}
        placeholder={placeholder}
        required={required}
        aria-invalid={required && hasError ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

// The dashboard view of the booking address form (the pickup address of a service that collects
// the vehicle or the customer): the same fields in the tenant's address format, and the same
// postal-code lookup as the hotsite (useAddressLookup).
export function NewBookingAddressFields({
  value,
  onChange,
  addressSpec,
  addressLookup = viaCepAddressLookup,
  hasError = false,
}: NewBookingAddressFieldsProps): React.JSX.Element {
  const t = useTranslations('booking.address');
  const { isLookingUp, lookupFailed, changeZipCode } = useAddressLookup({
    value,
    onChange,
    addressSpec,
    addressLookup,
  });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-6" data-testid="pickup-address-fields">
      <div className="sm:col-span-2">
        <Field
          id="pickup-address-zip-code"
          label={addressSpec.postalLabel}
          value={value.zipCode}
          placeholder={addressSpec.postalPlaceholder}
          onChange={changeZipCode}
          required
          hasError={hasError}
        />
        {isLookingUp && <p className="mt-1 text-xs text-gray-500">{t('searching')}</p>}
        {lookupFailed && <p className="mt-1 text-xs text-gray-500">{t('notFound')}</p>}
      </div>
      <Field
        className="sm:col-span-4"
        id="pickup-address-street"
        label={addressSpec.streetLabel}
        value={value.street}
        onChange={(street) => onChange({ ...value, street })}
        required
        hasError={hasError}
      />
      <Field
        className="sm:col-span-2"
        id="pickup-address-number"
        label={addressSpec.numberLabel}
        value={value.number}
        onChange={(number) => onChange({ ...value, number })}
        required
        hasError={hasError}
      />
      <Field
        className="sm:col-span-4"
        id="pickup-address-complement"
        label={addressSpec.complementLabel}
        value={value.complement ?? ''}
        onChange={(complement) => onChange({ ...value, complement })}
      />
      {addressSpec.requireNeighborhood && (
        <Field
          className="sm:col-span-3"
          id="pickup-address-neighborhood"
          label={addressSpec.neighborhoodLabel ?? t('neighborhoodLabel')}
          value={value.neighborhood ?? ''}
          onChange={(neighborhood) => onChange({ ...value, neighborhood })}
          required
          hasError={hasError}
        />
      )}
      <Field
        className="sm:col-span-2"
        id="pickup-address-city"
        label={addressSpec.cityLabel}
        value={value.city}
        onChange={(city) => onChange({ ...value, city })}
        required
        hasError={hasError}
      />
      <Field
        className="sm:col-span-1"
        id="pickup-address-state"
        label={addressSpec.stateLabel}
        value={value.state}
        onChange={(state) => onChange({ ...value, state })}
        required
        hasError={hasError}
      />
    </div>
  );
}
