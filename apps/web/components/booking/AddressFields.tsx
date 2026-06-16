'use client';

import { useRef, useState } from 'react';
import type React from 'react';
import type { Address } from '@beloauto/types';
import type { AddressLookup } from '@/lib/address/address-lookup.port';
import { viaCepAddressLookup } from '@/lib/address/viacep-address-lookup.adapter';
import { digitsOnly } from '@/lib/utils';

interface AddressFieldsProps {
  readonly value: Address;
  readonly onChange: (address: Address) => void;
  readonly idPrefix: string;
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
}: TextFieldProps) {
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
  addressLookup = viaCepAddressLookup,
  required = true,
  hasError = false,
}: AddressFieldsProps) {
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const lookupSeqRef = useRef(0);

  async function handleZipCodeChange(zipCode: string) {
    const digits = digitsOnly(zipCode);
    onChange({ ...value, zipCode: digits });
    setLookupFailed(false);

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

      onChange({ ...value, zipCode: digits, ...result });
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
          label="CEP"
          value={value.zipCode}
          onChange={handleZipCodeChange}
          inputMode="numeric"
          maxLength={9}
          placeholder="00000-000"
          required={required}
          hasError={required && hasError}
        />
        {isLookingUp && (
          <p className="mt-1 text-sm opacity-75" data-testid={`${idPrefix}-lookup-loading`}>
            Buscando endereço...
          </p>
        )}
        {lookupFailed && (
          <p className="mt-1 text-sm opacity-75" data-testid={`${idPrefix}-lookup-failed`}>
            CEP não encontrado. Preencha o endereço manualmente.
          </p>
        )}
      </div>

      <div className="sm:col-span-4">
        <TextField
          id={`${idPrefix}-street`}
          label="Rua"
          value={value.street}
          onChange={(street) => onChange({ ...value, street })}
          required={required}
          hasError={required && hasError}
        />
      </div>

      <div className="sm:col-span-2">
        <TextField
          id={`${idPrefix}-number`}
          label="Número"
          value={value.number}
          onChange={(number) => onChange({ ...value, number })}
          required={required}
          hasError={required && hasError}
        />
      </div>

      <div className="sm:col-span-4">
        <TextField
          id={`${idPrefix}-complement`}
          label="Complemento"
          value={value.complement ?? ''}
          onChange={(complement) => onChange({ ...value, complement })}
        />
      </div>

      <div className="sm:col-span-3">
        <TextField
          id={`${idPrefix}-neighborhood`}
          label="Bairro"
          value={value.neighborhood}
          onChange={(neighborhood) => onChange({ ...value, neighborhood })}
          required={required}
          hasError={required && hasError}
        />
      </div>

      <div className="sm:col-span-2">
        <TextField
          id={`${idPrefix}-city`}
          label="Cidade"
          value={value.city}
          onChange={(city) => onChange({ ...value, city })}
          required={required}
          hasError={required && hasError}
        />
      </div>

      <div className="sm:col-span-1">
        <TextField
          id={`${idPrefix}-state`}
          label="UF"
          value={value.state}
          onChange={(state) => onChange({ ...value, state })}
          maxLength={2}
          required={required}
          hasError={required && hasError}
        />
      </div>
    </div>
  );
}
