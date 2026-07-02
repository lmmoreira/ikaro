'use client';

import { useMemo } from 'react';
import { FormattingContext, type FormattingState } from '@/shared/lib/formatting/formatting-context';

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
}: FormattingProviderProps): React.JSX.Element {
  const value = useMemo(
    () => ({ locale, currency, timezone, dateFormat, timeFormat }),
    [locale, currency, timezone, dateFormat, timeFormat],
  );

  return <FormattingContext.Provider value={value}>{children}</FormattingContext.Provider>;
}
