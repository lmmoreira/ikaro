'use client';

import { useTranslations } from 'next-intl';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { utcDateFromISO } from '@/shared/lib/formatting/calendar-day';
import type { AvailableSlot, ResourceSelectionItem } from '@ikaro/types';
import { BrandedFeedbackMessage } from '@/shared/components/hotsite/branded-feedback-message';
import type { StepError } from '@/features/booking/hooks/useBookingFlow';
import { AvailabilityAlertEntry } from './AvailabilityAlertEntry';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { AvailabilityCarousel } from './AvailabilityCarousel';
import { SlotPicker } from './SlotPicker';

interface AvailabilityStepProps {
  readonly slug: string;
  readonly datePickerType: 'carousel' | 'calendar';
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string | null;
  readonly selectedSlot: AvailableSlot | null;
  readonly carouselDays: number;
  readonly maxBookingAdvanceDays: number;
  readonly minBookingAdvanceHours: number;
  readonly timezone: string;
  readonly onSelectDate: (date: string) => void;
  readonly onSelectSlot: (slot: AvailableSlot) => void;
  readonly resourceSelections?: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
  // The "Avise-me quando abrir" link (M23-S31), or null/absent when no alert can be offered.
  readonly alertHref?: string | null;
  readonly error: StepError | null;
  readonly onBack: () => void;
  readonly onNext: () => void;
}

// Extracted from BookingForm (TD37-S5A) — step 2 (date/slot selection) is a self-contained
// section wired only to its own step state, unrelated to the other 3 steps around it.
export function AvailabilityStep({
  slug,
  datePickerType,
  selectedServiceIds,
  selectedDate,
  selectedSlot,
  carouselDays,
  maxBookingAdvanceDays,
  minBookingAdvanceHours,
  timezone,
  onSelectDate,
  onSelectSlot,
  resourceSelections,
  durationMinutes,
  alertHref = null,
  error,
  onBack,
  onNext,
}: AvailabilityStepProps): React.JSX.Element {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
  const { formatDateLong } = useFormatting();

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        {t('availability.heading')}
      </h2>

      {datePickerType === 'calendar' ? (
        <AvailabilityCalendar
          slug={slug}
          serviceIds={selectedServiceIds}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          maxBookingAdvanceDays={maxBookingAdvanceDays}
          minBookingAdvanceHours={minBookingAdvanceHours}
          timezone={timezone}
          resourceSelections={resourceSelections}
          durationMinutes={durationMinutes}
        />
      ) : (
        <AvailabilityCarousel
          slug={slug}
          serviceIds={selectedServiceIds}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          carouselDays={carouselDays}
          maxBookingAdvanceDays={maxBookingAdvanceDays}
          minBookingAdvanceHours={minBookingAdvanceHours}
          timezone={timezone}
          resourceSelections={resourceSelections}
          durationMinutes={durationMinutes}
        />
      )}

      {selectedDate && (
        <div className="mt-4">
          <p
            className="mb-3 text-sm font-semibold"
            style={{ color: 'var(--ba-text)' }}
            data-testid="slots-heading"
          >
            {t('availability.slotsHeading', {
              date: formatDateLong(utcDateFromISO(selectedDate)),
            })}
          </p>
          <SlotPicker
            slug={slug}
            serviceIds={selectedServiceIds}
            date={selectedDate}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
            resourceSelections={resourceSelections}
            durationMinutes={durationMinutes}
            minBookingAdvanceHours={minBookingAdvanceHours}
          />
        </div>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer border px-6 py-3"
          style={{
            borderRadius: 'var(--ba-radius)',
            borderColor: 'var(--ba-secondary)',
            color: 'var(--ba-text)',
          }}
        >
          {tc('back')}
        </button>
        <AvailabilityAlertEntry href={alertHref} />
        <button
          type="button"
          disabled={!selectedSlot}
          onClick={onNext}
          data-testid="step-next"
          style={{
            backgroundColor: 'var(--ba-btn-bg)',
            color: 'var(--ba-btn-text)',
            borderColor: 'var(--ba-btn-border)',
            borderRadius: 'var(--ba-radius)',
          }}
          className="cursor-pointer border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {tc('next')}
        </button>
      </div>

      {error && (
        <div className="mt-4" data-testid="step2-error">
          <BrandedFeedbackMessage focusOnMount title={error.message} />
        </div>
      )}
    </div>
  );
}
