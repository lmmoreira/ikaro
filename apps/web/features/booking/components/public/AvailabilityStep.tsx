'use client';

import { useTranslations } from 'next-intl';
import type { AvailableSlot } from '@ikaro/types';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { AvailabilityCarousel } from './AvailabilityCarousel';
import { ErrorAlert } from './ErrorAlert';
import { SlotPicker } from './SlotPicker';

interface AvailabilityStepProps {
  readonly slug: string;
  readonly datePickerType: 'carousel' | 'calendar';
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string | null;
  readonly selectedSlot: AvailableSlot | null;
  readonly carouselDays: number;
  readonly maxBookingAdvanceDays: number;
  readonly onSelectDate: (date: string) => void;
  readonly onSelectSlot: (slot: AvailableSlot) => void;
  readonly error: string | null;
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
  onSelectDate,
  onSelectSlot,
  error,
  onBack,
  onNext,
}: AvailabilityStepProps): React.JSX.Element {
  const t = useTranslations('booking');
  const tc = useTranslations('common');

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
        />
      ) : (
        <AvailabilityCarousel
          slug={slug}
          serviceIds={selectedServiceIds}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          carouselDays={carouselDays}
          maxBookingAdvanceDays={maxBookingAdvanceDays}
        />
      )}

      {selectedDate && (
        <div className="mt-4">
          <SlotPicker
            slug={slug}
            serviceIds={selectedServiceIds}
            date={selectedDate}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
          />
        </div>
      )}

      {error && (
        <div className="mt-4" data-testid="step2-error">
          <ErrorAlert>{error}</ErrorAlert>
        </div>
      )}

      <div className="mt-6 flex gap-3">
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
    </div>
  );
}
