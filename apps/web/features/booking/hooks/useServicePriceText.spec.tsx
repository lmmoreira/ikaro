// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { describe, expect, it } from 'vitest';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { FormattingProvider } from '@/providers/formatting-provider';
import { makeHotsiteService } from '@/test-utils';
import { useServicePriceText, useServiceRateText } from './useServicePriceText';

function wrapper({ children }: { readonly children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="pt-BR" messages={ptBRMessages}>
      <FormattingProvider
        locale="pt-BR"
        currency="BRL"
        timezone="America/Sao_Paulo"
        dateFormat="DD/MM/YYYY"
        timeFormat="24h"
      >
        {children}
      </FormattingProvider>
    </NextIntlClientProvider>
  );
}

const FIXED = makeHotsiteService({ id: 'fixed' });
const PER_TIME = makeHotsiteService({
  id: 'per-time',
  bookingPolicy: {
    ...FIXED.bookingPolicy,
    durationPolicy: 'CUSTOMER_SELECTED',
    pricingPolicy: 'PER_TIME_INCREMENT',
    pricingIncrementMinutes: 30,
    pricePerIncrementAmount: 25,
    durationMinMinutes: 60,
    durationMaxMinutes: 120,
    durationIncrementMinutes: 30,
  },
});

describe('useServiceRateText', () => {
  it('is null for a fixed-price service', () => {
    const { result } = renderHook(() => useServiceRateText(FIXED), { wrapper });

    expect(result.current).toBeNull();
  });

  it('words the rate per hour or per increment', () => {
    const hourly = makeHotsiteService({
      id: 'hourly',
      bookingPolicy: { ...PER_TIME.bookingPolicy, pricingIncrementMinutes: 60 },
    });

    expect(renderHook(() => useServiceRateText(hourly), { wrapper }).result.current).toBe(
      'R$ 25,00 / hora',
    );
    expect(renderHook(() => useServiceRateText(PER_TIME), { wrapper }).result.current).toBe(
      'R$ 25,00 / 30 min',
    );
  });
});

describe('useServicePriceText', () => {
  it('is the catalogue price and duration for a fixed service', () => {
    const { result } = renderHook(() => useServicePriceText(FIXED), { wrapper });

    expect(result.current).toEqual({ kind: 'fixed', price: 'R$ 150,00', duration: '1h' });
  });

  it('is the rate and the duration range for a per-time service', () => {
    const { result } = renderHook(() => useServicePriceText(PER_TIME), { wrapper });

    expect(result.current).toEqual({
      kind: 'perTime',
      rate: 'R$ 25,00 / 30 min',
      durationRange: '1h a 2h',
    });
  });

  it('has no range when the policy sets none', () => {
    const open = makeHotsiteService({
      id: 'open',
      bookingPolicy: {
        ...PER_TIME.bookingPolicy,
        durationMinMinutes: null,
        durationMaxMinutes: null,
      },
    });

    expect(renderHook(() => useServicePriceText(open), { wrapper }).result.current).toMatchObject({
      kind: 'perTime',
      durationRange: null,
    });
  });
});
