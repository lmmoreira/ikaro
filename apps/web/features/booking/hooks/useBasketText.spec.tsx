// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type React from 'react';
import { describe, expect, it } from 'vitest';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import { FormattingProvider } from '@/providers/formatting-provider';
import type { BasketLine } from '@/features/booking/model/basket-lines';
import { useBasketLinePrice, useResourceLabelText } from './useBasketText';

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

const LINE: BasketLine = {
  serviceId: 'svc',
  name: 'Lavagem',
  amount: 80,
  priceFormatted: 'R$ 80,00',
  isFloor: false,
  durationMinutes: 30,
  isDurationChosen: false,
  startsAt: null,
  endsAt: null,
  legs: null,
  resources: [],
};

describe('useBasketLinePrice', () => {
  it('uses the catalogue’s formatted price when the line has one', () => {
    const { result } = renderHook(() => useBasketLinePrice(), { wrapper });

    expect(result.current(LINE)).toBe('R$ 80,00');
  });

  it('formats a computed amount, as a "from" floor until the duration is quoted', () => {
    const { result } = renderHook(() => useBasketLinePrice(), { wrapper });

    expect(result.current({ ...LINE, priceFormatted: null, amount: 75 })).toMatch(/75,00/);
    expect(result.current({ ...LINE, priceFormatted: null, amount: 50, isFloor: true })).toMatch(
      /a partir de.*50,00/,
    );
  });
});

describe('useResourceLabelText', () => {
  it('names a resource the customer chose and types one assigned automatically', () => {
    const { result } = renderHook(() => useResourceLabelText(), { wrapper });

    expect(result.current({ kind: 'chosen', type: 'STAFF', name: 'Ana' })).toBe(
      'com Ana (sua escolha)',
    );
    expect(result.current({ kind: 'auto', type: 'ROOM' })).toBe('Sala atribuída automaticamente');
  });
});
