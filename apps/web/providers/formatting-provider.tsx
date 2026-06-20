'use client';

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
}: FormattingProviderProps): React.JSX.Element {
  return (
    <FormattingContext.Provider value={{ locale, currency, timezone, dateFormat, timeFormat }}>
      {children}
    </FormattingContext.Provider>
  );
}
