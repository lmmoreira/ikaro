'use client';

import { useTranslations } from 'next-intl';
import type { AvailableSlot, BookingRescheduleOptions } from '@ikaro/types';
import { AvailabilityCarousel } from '@/features/booking/components/public/AvailabilityCarousel';
import { SlotPicker } from '@/features/booking/components/public/SlotPicker';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';

const CAROUSEL_DAYS = 14;

interface ReschedulePickerProps {
  readonly tenantSlug: string;
  readonly reschedule: BookingRescheduleOptions;
  readonly selectedDate: string;
  readonly selectedSlot: AvailableSlot | null;
  readonly onSelectDate: (date: string) => void;
  readonly onSelectSlot: (slot: AvailableSlot) => void;
}

export function ReschedulePicker({
  tenantSlug,
  reschedule,
  selectedDate,
  selectedSlot,
  onSelectDate,
  onSelectSlot,
}: ReschedulePickerProps): React.JSX.Element {
  const t = useTranslations('customer.reschedule');
  const { timezone } = useFormatting();
  const resourceSelections =
    reschedule.resourceSelections.length > 0 ? reschedule.resourceSelections : undefined;
  const durationMinutes = reschedule.durationMinutes ?? undefined;

  return (
    <>
      <div>
        <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
          {t('dateSectionLabel')}
        </p>
        <AvailabilityCarousel
          slug={tenantSlug}
          serviceIds={reschedule.serviceIds}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          carouselDays={CAROUSEL_DAYS}
          maxBookingAdvanceDays={reschedule.window.maxAdvanceDays}
          minBookingAdvanceHours={reschedule.window.minAdvanceHours}
          timezone={timezone}
          resourceSelections={resourceSelections}
          durationMinutes={durationMinutes}
          variant="dashboard"
        />
      </div>

      <div>
        <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
          {t('slotsSectionLabel')}
        </p>
        <SlotPicker
          slug={tenantSlug}
          serviceIds={reschedule.serviceIds}
          date={selectedDate}
          selectedSlot={selectedSlot}
          onSelectSlot={onSelectSlot}
          resourceSelections={resourceSelections}
          durationMinutes={durationMinutes}
          minBookingAdvanceHours={reschedule.window.minAdvanceHours}
          variant="dashboard"
        />
      </div>

      <p className="rounded-xl bg-blue-50 px-4 py-3.5 text-sm leading-relaxed text-gray-800">
        {t('sameDurationNote')}
      </p>
    </>
  );
}
