'use client';

import { useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { CreateOpeningRequest, ScheduleOpening } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { Button } from '@/shared/components/ui/button';
import { Calendar } from '@/shared/components/ui/calendar';
import { BookingActionSheetShell } from '@/features/booking/components/dashboard/bookings/BookingActionSheetShell';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { toDateKeyInTimezone } from '@/shared/utils/date-utils';
import { useModalDialog } from '@/features/booking/hooks/use-modal-dialog';
import { buildTimeOptions } from './time-options';

interface OpeningFormSheetProps {
  readonly open: boolean;
  readonly initialDate: string;
  readonly todayKey: string;
  readonly timezone: string;
  readonly slotGranularityMinutes: 15 | 30 | 60;
  readonly onClose: () => void;
  readonly onSubmit: (body: CreateOpeningRequest) => Promise<ScheduleOpening>;
}

export function OpeningFormSheet({
  open,
  initialDate,
  todayKey,
  timezone,
  slotGranularityMinutes,
  onClose,
  onSubmit,
}: OpeningFormSheetProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.schedule');
  const commonT = useTranslations('common');
  const { formatDateLong } = useFormatting();
  const dialogRef = useModalDialog(open);
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

  useEffect(() => {
    setPortalContainer(dialogRef.current);
  }, [dialogRef, open]);

  if (!open) return null;

  function validate(): string | null {
    if (!date) return t('errors.requiredDate');
    if (date < todayKey) return t('errors.pastDateOpening');
    if (!startTime || !endTime) return t('errors.openingTimePair');
    if (startTime >= endTime) return t('errors.openingTimeRange');
    return null;
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        date,
        startTime,
        endTime,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.detail) {
        setError(err.detail);
      } else {
        setError(t('errors.submitFailed'));
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <BookingActionSheetShell
      dialogRef={dialogRef}
      titleId="opening-sheet-title"
      descriptionId="opening-sheet-description"
      title={t('openingFormTitle')}
      description={t('openingFormDescription')}
      onClose={onClose}
      onSubmit={handleSubmit}
      cancelLabel={commonT('cancel')}
      submitLabel={t('submitOpen')}
      submitDisabled={isSubmitting}
      error={error}
    >
      <div className="space-y-4">
        <label className="block space-y-2">
          <span className="block text-sm font-medium text-gray-700">{t('dateLabel')}</span>
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
                onSelect={(selected) => {
                  if (!selected) return;
                  setDate(toDateKeyInTimezone(selected, timezone));
                  setCalendarMonth(selected);
                  setDateOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-2">
            <span className="block text-sm font-medium text-gray-700">{t('startTimeLabel')}</span>
            <Select value={startTime} onValueChange={setStartTime}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('timePlaceholder')} />
              </SelectTrigger>
              <SelectContent container={portalContainer}>
                {timeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="block space-y-2">
            <span className="block text-sm font-medium text-gray-700">{t('endTimeLabel')}</span>
            <Select value={endTime} onValueChange={setEndTime}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('timePlaceholder')} />
              </SelectTrigger>
              <SelectContent container={portalContainer}>
                {timeOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <label className="block space-y-2">
          <span className="block text-sm font-medium text-gray-700">{t('notesLabel')}</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={200}
            rows={4}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        </label>
      </div>
    </BookingActionSheetShell>
  );
}
