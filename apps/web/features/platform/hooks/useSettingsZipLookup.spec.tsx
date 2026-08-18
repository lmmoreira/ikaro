// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { countrySpec } from '@ikaro/i18n';
import { InMemoryAddressLookup } from '@/shared/lib/address/in-memory-address-lookup';
import type { SettingsFormValues } from '@/features/platform/settings-form';
import { useSettingsZipLookup } from './useSettingsZipLookup';

const BR_ADDRESS_SPEC = countrySpec('BR').address;

function baseValues(): SettingsFormValues {
  return {
    name: 'BeloAuto',
    cancellationWindowHours: '48',
    serviceBufferMinutes: '10',
    autoApproveEnabled: false,
    minBookingAdvanceHours: '2',
    maxBookingAdvanceDays: '60',
    slotGranularityMinutes: '30',
    welcomeStaffScreenDays: '14',
    loyaltyExpiryDays: '180',
    loyaltyExpiryWarningDays: '15',
    loyaltyEnableNotifications: true,
    loyaltyNotificationMinPoints: '10',
    pointsPerCurrencyUnit: '10',
    timezone: 'America/Sao_Paulo',
    days: {
      monday: { open: '08:00', close: '18:00', closed: false },
      tuesday: { open: '08:00', close: '18:00', closed: false },
      wednesday: { open: '08:00', close: '18:00', closed: false },
      thursday: { open: '08:00', close: '18:00', closed: false },
      friday: { open: '08:00', close: '18:00', closed: false },
      saturday: { open: '09:00', close: '13:00', closed: false },
      sunday: { open: '', close: '', closed: true },
    },
    phone: '31999999999',
    email: 'contato@beloauto.com.br',
    address: {
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
      zipCode: '',
    },
    notificationFromEmail: '',
    socialLinks: { whatsapp: '', instagram: '', facebook: '' },
  };
}

describe('useSettingsZipLookup', () => {
  it('formats and sets the address field but never looks up when the country has no viacep lookup', async () => {
    const addressLookup = new InMemoryAddressLookup({});
    const setAddressField = vi.fn();
    const setValues = vi.fn();
    const { result } = renderHook(() =>
      useSettingsZipLookup({
        addressSpec: { ...BR_ADDRESS_SPEC, lookupService: 'none' },
        addressLookup,
        setAddressField,
        setValues,
      }),
    );

    await act(async () => {
      await result.current.handleZipCodeChange('30130100');
    });

    expect(setAddressField).toHaveBeenCalledWith('zipCode', '30130-100');
    expect(addressLookup.calls).toEqual([]);
    expect(result.current.isLookingUpZip).toBe(false);
  });

  it('does not look up until the formatted value has a full 8-digit CEP', async () => {
    const addressLookup = new InMemoryAddressLookup({});
    const { result } = renderHook(() =>
      useSettingsZipLookup({
        addressSpec: BR_ADDRESS_SPEC,
        addressLookup,
        setAddressField: vi.fn(),
        setValues: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleZipCodeChange('3013');
    });

    expect(addressLookup.calls).toEqual([]);
  });

  it('on a successful lookup, fills in the resolved address fields and clears the loading/failed flags', async () => {
    const addressLookup = new InMemoryAddressLookup({
      '30130100': {
        street: 'Av. Afonso Pena',
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
      },
    });
    const setValues = vi.fn();
    const { result } = renderHook(() =>
      useSettingsZipLookup({
        addressSpec: BR_ADDRESS_SPEC,
        addressLookup,
        setAddressField: vi.fn(),
        setValues,
      }),
    );

    await act(async () => {
      await result.current.handleZipCodeChange('30130100');
    });

    expect(addressLookup.calls).toEqual(['30130100']);
    expect(result.current.isLookingUpZip).toBe(false);
    expect(result.current.zipLookupFailed).toBe(false);

    const updater = setValues.mock.calls[0][0] as (prev: SettingsFormValues) => SettingsFormValues;
    const updated = updater(baseValues());
    expect(updated.address).toMatchObject({
      zipCode: '30130-100',
      street: 'Av. Afonso Pena',
      neighborhood: 'Centro',
      city: 'Belo Horizonte',
      state: 'MG',
    });
  });

  it('marks zipLookupFailed when the CEP is not found', async () => {
    const addressLookup = new InMemoryAddressLookup({});
    const { result } = renderHook(() =>
      useSettingsZipLookup({
        addressSpec: BR_ADDRESS_SPEC,
        addressLookup,
        setAddressField: vi.fn(),
        setValues: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleZipCodeChange('99999999');
    });

    expect(result.current.zipLookupFailed).toBe(true);
    expect(result.current.isLookingUpZip).toBe(false);
  });

  it('discards a stale lookup result when a newer lookup has since started (sequence guard)', async () => {
    let resolveFirst: (value: null) => void = () => {};
    const firstLookup = new Promise<null>((resolve) => {
      resolveFirst = resolve;
    });
    const addressLookup = {
      lookup: vi
        .fn()
        .mockImplementationOnce(() => firstLookup)
        .mockImplementationOnce(async () => ({
          street: 'Rua Nova',
          neighborhood: 'Bairro Novo',
          city: 'Belo Horizonte',
          state: 'MG',
        })),
    };
    const setValues = vi.fn();
    const setAddressField = vi.fn();
    const { result } = renderHook(() =>
      useSettingsZipLookup({
        addressSpec: BR_ADDRESS_SPEC,
        addressLookup,
        setAddressField,
        setValues,
      }),
    );

    let firstCallSettled = false;
    act(() => {
      void result.current.handleZipCodeChange('30130100').then(() => {
        firstCallSettled = true;
      });
    });

    await act(async () => {
      await result.current.handleZipCodeChange('01310100');
    });

    resolveFirst(null);
    await waitFor(() => expect(firstCallSettled).toBe(true));

    // Only the second (latest) lookup's success should have been applied — the first call's
    // late-arriving null result must not flip zipLookupFailed back to true afterward.
    expect(result.current.zipLookupFailed).toBe(false);
    expect(setValues).toHaveBeenCalledTimes(1);
  });
});
