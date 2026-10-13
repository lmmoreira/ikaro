'use client';

import { useRef, useState } from 'react';
import type { Address, HotsiteAddressSpec } from '@ikaro/types';
import type { AddressLookup } from '@/shared/lib/address/address-lookup.port';
import { digitsOnly } from '@/shared/utils/digits-only';

interface UseAddressLookupParams {
  readonly value: Address;
  readonly onChange: (address: Address) => void;
  readonly addressSpec: HotsiteAddressSpec;
  readonly addressLookup: AddressLookup;
}

interface UseAddressLookupResult {
  readonly isLookingUp: boolean;
  readonly lookupFailed: boolean;
  readonly changeZipCode: (zipCode: string) => Promise<void>;
}

// The postal-code lookup of a booking address form, shared by the hotsite's AddressFields and the
// dashboard's: a full postal code fills in street, neighbourhood, city and state, and only the
// latest lookup may land (a slow earlier answer never overwrites a newer code).
export function useAddressLookup({
  value,
  onChange,
  addressSpec,
  addressLookup,
}: UseAddressLookupParams): UseAddressLookupResult {
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const lookupSeqRef = useRef(0);

  async function changeZipCode(zipCode: string): Promise<void> {
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

  return { isLookingUp, lookupFailed, changeZipCode };
}
