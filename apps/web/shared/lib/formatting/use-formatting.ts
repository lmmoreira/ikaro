'use client';

import { useContext } from 'react';
import { formatDate, formatDateLong, formatMonthYear, formatTime } from './format-time';
import { formatCurrencySymbol, formatMoney } from './format-money';
import { FormattingContext } from './formatting-context';

export interface FormattingUtils {
  timezone: string;
  currencySymbol: string;
  // Raw 12h/24h flag — for components that need to branch on the tenant's clock
  // convention (e.g. showing an AM/PM control), not just format a Date to a string.
  timeFormat: '24h' | '12h';
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
    timeFormat,
    formatMoney: (amount) => formatMoney(amount, locale, currency),
    formatDate: (date) => formatDate(date, timezone, dateFormat),
    formatDateLong: (date) => formatDateLong(date, locale),
    formatTime: (date) => formatTime(date, locale, timezone, timeFormat),
    formatMonthYear: (date) => formatMonthYear(date, locale),
    formatWeekdayShort: (date) =>
      new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date),
  };
}
