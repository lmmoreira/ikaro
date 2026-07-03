'use client';

import type * as React from 'react';
import { useContext } from 'react';
import { DayPicker } from 'react-day-picker';
import { enUS, ptBR } from 'date-fns/locale';
import { buttonVariants } from '@/shared/components/ui/button';
import { FormattingContext } from '@/shared/lib/formatting/formatting-context';
import { resolveSupportedLocale } from '@/shared/lib/i18n/get-messages';
import { cn } from '@/shared/utils/cn';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function resolveDayPickerLocale(locale: string) {
  return resolveSupportedLocale(locale) === 'en' ? enUS : ptBR;
}

function getModifiersClassName(): Record<string, string> {
  return {
    root: 'p-3',
    months: 'flex w-full flex-col gap-4 sm:flex-row sm:gap-8',
    month: 'relative space-y-4',
    month_caption: 'relative flex h-11 w-full items-center justify-center px-11 pt-1',
    caption_label: 'text-sm font-semibold text-gray-900',
    button_previous: cn(
      buttonVariants({ variant: 'outline' }),
      'absolute left-0 top-0 z-10 h-11 w-11 bg-transparent p-0 opacity-70 hover:opacity-100',
    ),
    button_next: cn(
      buttonVariants({ variant: 'outline' }),
      'absolute right-0 top-0 z-10 h-11 w-11 bg-transparent p-0 opacity-70 hover:opacity-100',
    ),
    chevron: 'h-4 w-4',
    weekday: 'text-gray-500 rounded-md w-9 font-normal text-[0.8rem]',
    month_grid: 'w-full border-collapse space-y-1',
    row: 'flex w-full mt-2',
    cell: 'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
    day_button: cn(
      buttonVariants({ variant: 'ghost' }),
      'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
    ),
    today: 'ring-1 ring-inset ring-blue-400',
    selected: 'bg-blue-600 !text-white hover:bg-blue-600 hover:!text-white',
    outside: 'text-gray-400 opacity-50',
    disabled: 'text-gray-300 opacity-50',
    hidden: 'invisible',
  };
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  locale: localeProp,
  ...props
}: CalendarProps): React.JSX.Element {
  const { locale } = useContext(FormattingContext);

  return (
    <DayPicker
      locale={localeProp ?? resolveDayPickerLocale(locale)}
      showOutsideDays={showOutsideDays}
      navLayout="around"
      className={cn('p-3', className)}
      classNames={{
        ...getModifiersClassName(),
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
