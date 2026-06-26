'use client';

import { useMemo } from 'react';
import { FormattingContext, type FormattingState } from '@/lib/formatting/formatting-context';

interface FormattingProviderProps extends FormattingState {
  readonly children: React.ReactNode;
}

export function FormattingProvider({
  children,
  locale,
  currency,
  timezone,
  dateFormat,
  timeFormat,
  welcomeStaffScreenDays,
}: FormattingProviderProps): React.JSX.Element {
  const value = useMemo(
    () => ({ locale, currency, timezone, dateFormat, timeFormat, welcomeStaffScreenDays }),
    [locale, currency, timezone, dateFormat, timeFormat, welcomeStaffScreenDays],
  );

  return <FormattingContext.Provider value={value}>{children}</FormattingContext.Provider>;
}
