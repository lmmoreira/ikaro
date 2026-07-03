'use client';

import { useContext } from 'react';
import { formatDate, formatDateLong, formatMonthYear, formatTime } from './format-time';
import { formatCurrencySymbol, formatMoney } from './format-money';
import { FormattingContext } from './formatting-context';

export interface FormattingUtils {
  timezone: string;
  currencySymbol: string;
  formatMoney: (amount: number) => string;
  formatDate: (date: Date) => string;
  formatDateLong: (date: Date) => string;
  formatTime: (date: Date) => string;
  formatMonthYear: (date: Date) => string;
  formatWeekdayShort: (date: Date) => string;
}

export function useFormatting(): FormattingUtils {
  const { locale, currency, currencySymbol, timezone, dateFormat, timeFormat } =
    useContext(FormattingContext);

  return {
    timezone,
    currencySymbol: currencySymbol ?? formatCurrencySymbol(locale, currency),
    formatMoney: (amount) => formatMoney(amount, locale, currency),
    formatDate: (date) => formatDate(date, timezone, dateFormat),
    formatDateLong: (date) => formatDateLong(date, locale),
    formatTime: (date) => formatTime(date, locale, timezone, timeFormat),
    formatMonthYear: (date) => formatMonthYear(date, locale),
    formatWeekdayShort: (date) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date),
  };
}
