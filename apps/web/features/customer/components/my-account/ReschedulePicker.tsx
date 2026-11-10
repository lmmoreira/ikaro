'use client';

import { useTranslations } from 'next-intl';
import type { AvailableSlot, BookingRescheduleOptions } from '@ikaro/types';
import { AvailabilityCarousel } from '@/features/booking/components/public/AvailabilityCarousel';
import { SlotPicker } from '@/features/booking/components/public/SlotPicker';
import { Card } from '@/shared/components/ui/card';
import { RESCHEDULE_CAROUSEL_DAYS } from '@/features/booking/model/reschedule-date';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { utcDateFromISO } from '@/shared/lib/formatting/calendar-day';

interface ReschedulePickerProps {
  readonly tenantSlug: string;
  readonly reschedule: BookingRescheduleOptions;
  readonly selectedDate: string | null;
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
  const { timezone, formatDateLong } = useFormatting();
  const resourceSelections =
    reschedule.resourceSelections.length > 0 ? reschedule.resourceSelections : undefined;
  const durationMinutes = reschedule.durationMinutes ?? undefined;

  return (
    <>
      <Card className="rounded-xl border-gray-100 p-4 shadow-none">
        <p className="mb-2.5 text-sm font-semibold text-gray-900">{t('dateSectionLabel')}</p>
        <AvailabilityCarousel
          slug={tenantSlug}
          serviceIds={reschedule.serviceIds}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          carouselDays={RESCHEDULE_CAROUSEL_DAYS}
          maxBookingAdvanceDays={reschedule.window.maxAdvanceDays}
          minBookingAdvanceHours={reschedule.window.minAdvanceHours}
          timezone={timezone}
          resourceSelections={resourceSelections}
          durationMinutes={durationMinutes}
          variant="dashboard"
        />
      </Card>

      {selectedDate !== null && (
        <Card className="rounded-xl border-gray-100 p-4 shadow-none">
          <p className="mb-2.5 text-sm font-semibold text-gray-900">
            {t('slotsSectionLabel', { date: formatDateLong(utcDateFromISO(selectedDate)) })}
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
          <p className="mt-3 rounded-lg bg-blue-50 px-3.5 py-3 text-sm leading-relaxed text-gray-800">
            {t('sameDurationNote')}
          </p>
        </Card>
      )}
    </>
  );
}
