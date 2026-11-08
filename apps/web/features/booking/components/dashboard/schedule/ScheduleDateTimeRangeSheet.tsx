'use client';

import { Textarea } from '@/shared/components/ui/textarea';
import { useMemo, useState, type ReactNode, type SubmitEvent } from 'react';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { Button } from '@/shared/components/ui/button';
import { Calendar } from '@/shared/components/ui/calendar';
import { BookingActionSheetShell } from '@/features/booking/components/dashboard/bookings/sheets/BookingActionSheetShell';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { toISODateInTimezone } from '@/shared/lib/formatting/date-utils';
import { buildTimeOptions } from './time-options';
import { TimeSelectField } from './TimeSelectField';

export interface ScheduleDateTimeRangeFormValues {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly notes: string;
}

interface ScheduleDateTimeRangeSheetProps<TBody, TResponse> {
  readonly open: boolean;
  readonly initialDate: string;
  readonly timezone: string;
  readonly slotGranularityMinutes: 15 | 30 | 60;
  readonly onClose: () => void;
  readonly onSubmit: (body: TBody) => Promise<TResponse>;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly cancelLabel: string;
  readonly submitLabel: string;
  readonly submitVariant?: 'default' | 'destructive';
  readonly dateLabel: string;
  readonly startTimeLabel: string;
  readonly endTimeLabel: string;
  readonly notesLabel: string;
  readonly timePlaceholder: string;
  readonly fullDayHint?: ReactNode;
  readonly children?: ReactNode;
  readonly validate: (values: ScheduleDateTimeRangeFormValues) => string | null;
  readonly buildRequest: (values: ScheduleDateTimeRangeFormValues) => TBody;
}

export function ScheduleDateTimeRangeSheet<TBody, TResponse>({
  open,
  initialDate,
  timezone,
  slotGranularityMinutes,
  onClose,
  onSubmit,
  title,
  description,
  cancelLabel,
  submitLabel,
  submitVariant = 'default',
  dateLabel,
  startTimeLabel,
  endTimeLabel,
  notesLabel,
  timePlaceholder,
  fullDayHint,
  children,
  validate,
  buildRequest,
}: ScheduleDateTimeRangeSheetProps<TBody, TResponse>): React.JSX.Element | null {
  const locale = useResolvedLocale();
  const { formatDateLong } = useFormatting();
  // The popovers portal into the dialog's own content: a modal dialog leaves the rest inert.
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [date, setDate] = useState(initialDate);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(`${initialDate}T00:00:00`));
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeOptions = useMemo(
    () => buildTimeOptions(slotGranularityMinutes),
    [slotGranularityMinutes],
  );
  const selectedDate = useMemo(() => new Date(`${date}T00:00:00`), [date]);

  if (!open) return null;

  function validateValues(): string | null {
    return validate({ date, startTime, endTime, notes });
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validationError = validateValues();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(buildRequest({ date, startTime, endTime, notes }));
      onClose();
    } catch (err) {
      setError(resolveErrorMessageFromApiError(err, locale));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <BookingActionSheetShell
      contentRef={setPortalContainer}
      title={title}
      description={description}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={cancelLabel}
      submitLabel={submitLabel}
      submitVariant={submitVariant}
      submitDisabled={isSubmitting}
      error={error}
    >
      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="block text-sm font-medium text-gray-700">{dateLabel}</span>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start px-3 font-normal"
              >
                {formatDateLong(selectedDate)}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start" container={portalContainer}>
              <Calendar
                mode="single"
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                selected={selectedDate}
                className="border-0"
                classNames={{ root: 'p-0' }}
                onSelect={(selected) => {
                  if (!selected) return;
                  setDate(toISODateInTimezone(selected, timezone));
                  setCalendarMonth(selected);
                  setDateOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </label>

        {children}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TimeSelectField
            label={startTimeLabel}
            value={startTime}
            onValueChange={setStartTime}
            options={timeOptions}
            placeholder={timePlaceholder}
            portalContainer={portalContainer}
          />
          <TimeSelectField
            label={endTimeLabel}
            value={endTime}
            onValueChange={setEndTime}
            options={timeOptions}
            placeholder={timePlaceholder}
            portalContainer={portalContainer}
          />
        </div>

        {fullDayHint ? <p className="text-xs text-gray-500">{fullDayHint}</p> : null}

        <label className="block space-y-2">
          <span className="block text-sm font-medium text-gray-700">{notesLabel}</span>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={200}
            rows={4}
          />
        </label>
      </div>
    </BookingActionSheetShell>
  );
}
