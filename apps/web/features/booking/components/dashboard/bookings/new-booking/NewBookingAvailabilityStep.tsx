'use client';

import { useTranslations } from 'next-intl';
import type { AvailableSlot, ResourceSelectionItem } from '@ikaro/types';
import type { StepError } from '@/features/booking/hooks/useBookingFlow';
import { AvailabilityCarousel } from '@/features/booking/components/public/AvailabilityCarousel';
import { SlotPicker } from '@/features/booking/components/public/SlotPicker';
import { NewBookingStepLayout } from './NewBookingStepLayout';
import { SECTION_LABEL_CLASS } from './new-booking-styles';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

const CAROUSEL_DAYS = 14;

interface NewBookingAvailabilityStepProps {
  readonly slug: string;
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string | null;
  readonly selectedSlot: AvailableSlot | null;
  readonly maxBookingAdvanceDays: number;
  /** The business's minimum notice: staff may book inside it, and those slots are marked. */
  readonly minBookingAdvanceHours: number;
  readonly timezone: string;
  readonly resourceSelections: readonly ResourceSelectionItem[];
  readonly durationMinutes?: number;
  readonly error: StepError | null;
  readonly onSelectDate: (date: string) => void;
  readonly onSelectSlot: (slot: AvailableSlot) => void;
  readonly summary: React.ReactNode;
  readonly onBack: () => void;
  readonly onNext: () => void;
}

// Date and time for staff. The carousel and slot picker are the dashboard variants staff
// reschedule already uses; the minimum notice does not apply to staff (the backend skips that one
// rule), so it is passed as 0 and only marks the slots it would have hidden from a customer.
export function NewBookingAvailabilityStep({
  slug,
  selectedServiceIds,
  selectedDate,
  selectedSlot,
  maxBookingAdvanceDays,
  minBookingAdvanceHours,
  timezone,
  resourceSelections,
  durationMinutes,
  error,
  onSelectDate,
  onSelectSlot,
  summary,
  onBack,
  onNext,
}: NewBookingAvailabilityStepProps): React.JSX.Element {
  const t = useTranslations('booking.availability');
  const tn = useTranslations('dashboard.newBooking.steps');

  return (
    <NewBookingStepLayout
      summary={summary}
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!selectedSlot}
    >
      <div data-testid="step-availability">
        <h2 className="text-xl font-bold text-gray-900">{t('heading')}</h2>
      </div>

      <AvailabilityCarousel
        slug={slug}
        serviceIds={selectedServiceIds}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        carouselDays={CAROUSEL_DAYS}
        maxBookingAdvanceDays={maxBookingAdvanceDays}
        minBookingAdvanceHours={0}
        timezone={timezone}
        resourceSelections={resourceSelections}
        durationMinutes={durationMinutes}
        variant="dashboard"
      />

      {selectedDate && (
        <section>
          <p className={SECTION_LABEL_CLASS}>{tn('slotsLabel')}</p>
          <SlotPicker
            slug={slug}
            serviceIds={selectedServiceIds}
            date={selectedDate}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
            resourceSelections={resourceSelections}
            durationMinutes={durationMinutes}
            noticeMarkerHours={minBookingAdvanceHours}
            variant="dashboard"
          />
          {minBookingAdvanceHours > 0 && (
            <p className="mt-2 text-xs text-gray-500" data-testid="notice-legend">
              {tn('noticeLegend', { hours: minBookingAdvanceHours })}
            </p>
          )}
        </section>
      )}

      {error && <FeedbackMessage focusOnMount testId="step2-error" title={error.message} />}
    </NewBookingStepLayout>
  );
}
