import { createContext } from 'react';
import type { DateFormat } from '@ikaro/i18n';

export interface FormattingState {
  readonly locale: string;
  readonly currency: string;
  readonly timezone: string;
  readonly dateFormat: DateFormat;
  readonly timeFormat: '24h' | '12h';
  readonly welcomeStaffScreenDays: number;
}

export const FormattingContext = createContext<FormattingState>({
  locale: 'pt-BR',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  welcomeStaffScreenDays: 14,
});
