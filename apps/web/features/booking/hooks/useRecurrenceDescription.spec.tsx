// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { AbstractIntlMessages } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import ptBRMessages from '@ikaro/i18n/locales/pt-BR/web.json';
import enMessages from '@ikaro/i18n/locales/en/web.json';
import { FormattingProvider } from '@/providers/formatting-provider';
import type { RecurrenceRule } from '@ikaro/types';
import { useRecurrenceDescription } from './useRecurrenceDescription';

function wrapperFor(locale: 'pt-BR' | 'en') {
  const messages = (locale === 'pt-BR' ? ptBRMessages : enMessages) as AbstractIntlMessages;
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        <FormattingProvider
          locale={locale}
          currency="BRL"
          timezone="America/Sao_Paulo"
          dateFormat={locale === 'pt-BR' ? 'DD/MM/YYYY' : 'MM/DD/YYYY'}
          timeFormat="24h"
        >
          {children}
        </FormattingProvider>
      </NextIntlClientProvider>
    );
  };
}

function rule(daysOfWeek: RecurrenceRule['daysOfWeek']): RecurrenceRule {
  return { frequency: 'WEEKLY', daysOfWeek, startTime: '10:00', durationMinutes: 120 };
}

describe('useRecurrenceDescription', () => {
  it('words a single weekday as "Toda terça · 10:00–12:00"', () => {
    const { result } = renderHook(() => useRecurrenceDescription(), {
      wrapper: wrapperFor('pt-BR'),
    });

    expect(result.current.patternLine(rule(['tuesday']))).toBe('Toda terça · 10:00–12:00');
  });

  it('lists several weekdays Monday first, whatever order they arrive in', () => {
    const { result } = renderHook(() => useRecurrenceDescription(), {
      wrapper: wrapperFor('pt-BR'),
    });

    expect(result.current.patternLine(rule(['thursday', 'monday']))).toBe(
      'Toda semana: seg e qui · 10:00–12:00',
    );
  });

  it('wraps the end time past midnight', () => {
    const { result } = renderHook(() => useRecurrenceDescription(), {
      wrapper: wrapperFor('pt-BR'),
    });

    expect(
      result.current.patternLine({
        frequency: 'WEEKLY',
        daysOfWeek: ['friday'],
        startTime: '23:00',
        durationMinutes: 120,
      }),
    ).toBe('Toda sexta · 23:00–01:00');
  });

  it('follows the locale', () => {
    const { result } = renderHook(() => useRecurrenceDescription(), { wrapper: wrapperFor('en') });

    expect(result.current.patternLine(rule(['sunday']))).toBe('Every Sunday · 10:00–12:00');
    expect(result.current.patternLine(rule(['wednesday', 'monday']))).toBe(
      'Every week: Mon and Wed · 10:00–12:00',
    );
  });

  it('formats a date key in the tenant date format, on the same calendar day', () => {
    const pt = renderHook(() => useRecurrenceDescription(), { wrapper: wrapperFor('pt-BR') });
    const en = renderHook(() => useRecurrenceDescription(), { wrapper: wrapperFor('en') });

    expect(pt.result.current.formatDateKey('2026-11-11')).toBe('11/11/2026');
    expect(en.result.current.formatDateKey('2026-11-12')).toBe('11/12/2026');
  });
});
