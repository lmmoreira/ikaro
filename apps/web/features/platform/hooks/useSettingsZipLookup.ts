'use client';

import { useRef, useState } from 'react';
import type { AddressSpec } from '@ikaro/i18n';
import { digitsOnly } from '@/shared/utils/digits-only';
import { formatPostalCodeForDisplay } from '@/shared/utils/postal-code-format';
import type { AddressLookup } from '@/shared/lib/address/address-lookup.port';
import type { SettingsAddressValues, SettingsFormValues } from '@/features/platform/settings-form';

interface UseSettingsZipLookupParams {
  readonly addressSpec: AddressSpec;
  readonly addressLookup: AddressLookup;
  readonly setAddressField: (key: keyof SettingsAddressValues, value: string) => void;
  readonly setValues: (updater: (prev: SettingsFormValues) => SettingsFormValues) => void;
}

interface UseSettingsZipLookupResult {
  readonly isLookingUpZip: boolean;
  readonly zipLookupFailed: boolean;
  readonly handleZipCodeChange: (rawValue: string) => Promise<void>;
}

interface ZipLookupRunSetters {
  readonly setZipLookupFailed: (failed: boolean) => void;
  readonly setIsLookingUpZip: (loading: boolean) => void;
  readonly setValues: (updater: (prev: SettingsFormValues) => SettingsFormValues) => void;
}

async function runZipLookup(
  params: UseSettingsZipLookupParams,
  formatted: string,
  digits: string,
  seqRef: { current: number },
  seq: number,
  setters: ZipLookupRunSetters,
): Promise<void> {
  try {
    const result = await params.addressLookup.lookup(digits);
    if (seq !== seqRef.current) return;

    if (!result) {
      setters.setZipLookupFailed(true);
      return;
    }

    setters.setValues((prev) => ({
      ...prev,
      address: {
        ...prev.address,
        zipCode: formatted,
        street: result.street,
        neighborhood: result.neighborhood,
        city: result.city,
        state: result.state,
      },
    }));
  } catch {
    if (seq === seqRef.current) setters.setZipLookupFailed(true);
  } finally {
    if (seq === seqRef.current) setters.setIsLookingUpZip(false);
  }
}

// Extracted from SettingsForm (TD37-S5A) — the postal-code lookup flow (debounce-by-sequence,
// loading/failed state, and the resulting address auto-fill) is a self-contained concern,
// unrelated to the rest of the form's field state.
export function useSettingsZipLookup(
  params: UseSettingsZipLookupParams,
): UseSettingsZipLookupResult {
  const [isLookingUpZip, setIsLookingUpZip] = useState(false);
  const [zipLookupFailed, setZipLookupFailed] = useState(false);
  const zipLookupSeqRef = useRef(0);

  async function handleZipCodeChange(rawValue: string): Promise<void> {
    const formatted = formatPostalCodeForDisplay(rawValue, params.addressSpec.postalPlaceholder);
    params.setAddressField('zipCode', formatted);
    setZipLookupFailed(false);

    if (params.addressSpec.lookupService !== 'viacep') return;
    const digits = digitsOnly(formatted);
    if (digits.length !== 8) return;

    const seq = ++zipLookupSeqRef.current;
    setIsLookingUpZip(true);
    await runZipLookup(params, formatted, digits, zipLookupSeqRef, seq, {
      setZipLookupFailed,
      setIsLookingUpZip,
      setValues: params.setValues,
    });
  }

  return { isLookingUpZip, zipLookupFailed, handleZipCodeChange };
}
