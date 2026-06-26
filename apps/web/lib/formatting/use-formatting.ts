'use client';

import { useContext } from 'react';
import { formatDate, formatDateLong, formatMonthYear, formatTime } from './format-time';
import { formatMoney } from './format-money';
import { FormattingContext } from './formatting-context';

export interface FormattingUtils {
  formatMoney: (amount: number) => string;
  formatDate: (date: Date) => string;
  formatDateLong: (date: Date) => string;
  formatTime: (date: Date) => string;
  formatMonthYear: (date: Date) => string;
}

export function useFormatting(): FormattingUtils {
  const { locale, currency, timezone, dateFormat, timeFormat } = useContext(FormattingContext);

  return {
    formatMoney: (amount) => formatMoney(amount, locale, currency),
    formatDate: (date) => formatDate(date, timezone, dateFormat),
    formatDateLong: (date) => formatDateLong(date, locale),
    formatTime: (date) => formatTime(date, locale, timezone, timeFormat),
    formatMonthYear: (date) => formatMonthYear(date, locale),
  };
}
