'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  AvailableSlot,
  BookingRescheduleOptions,
  CustomerBookingDetailResponse,
} from '@ikaro/types';
import { rescheduleBookingAsCustomer } from '@/features/booking/api/customer';
import { initialRescheduleDate } from '@/features/booking/model/reschedule-date';
import {
  classifyRescheduleFailure,
  shouldReloadSlots,
  type RescheduleFailure,
} from '@/features/booking/model/reschedule-failure';
import { ErrorAlert } from '@/features/booking/components/public/ErrorAlert';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { extractProblemCode, resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { appendReturnTo } from '../../booking-navigation';
import type { BookingWindowFacts } from '../../hooks/useDescribeBookingWindow';
import { canRescheduleBooking } from '../../booking-sections';
import { useCustomerTopbarStatus } from '../customer-topbar-status-context';
import { RescheduleActionPane } from './RescheduleActionPane';
import { RescheduleBookingFacts } from './RescheduleBookingFacts';
import { RescheduleKeptPicks } from './RescheduleKeptPicks';
import { ReschedulePicker } from './ReschedulePicker';
import { RescheduleSuccessView } from './RescheduleSuccessView';
import { RescheduleWindowExpiredView } from './RescheduleWindowExpiredView';

interface CustomerReschedulePageProps {
  readonly booking: CustomerBookingDetailResponse;
  readonly reschedule: BookingRescheduleOptions;
  readonly scheduledAt: string;
  readonly tenantSlug: string;
  readonly whatsapp: string | null;
  readonly returnTo?: string | null;
}

interface FailureNotice {
  readonly title: string;
  readonly hint: string;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

export function CustomerReschedulePage({
  booking,
  reschedule,
  scheduledAt,
  tenantSlug,
  whatsapp,
  returnTo = null,
}: CustomerReschedulePageProps): React.JSX.Element {
  const t = useTranslations('customer.reschedule');
  const locale = useResolvedLocale();
  const { timezone } = useFormatting();
  const topbarStatus = useCustomerTopbarStatus();
  const setBookingStatus = topbarStatus?.setBookingStatus;
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;

  const start = new Date(scheduledAt);
  const durationMins = booking.lines.reduce((sum, line) => sum + line.durationMinsAtBooking, 0);
  const current: BookingWindowFacts = {
    start,
    end: new Date(start.getTime() + durationMins * MS_PER_MINUTE),
  };
  const eligibleUntil = new Date(reschedule.eligibleUntil);
  const serviceNames = booking.lines.map((line) => line.serviceName).join(', ');
  const bookingHref = appendReturnTo(
    `/${tenantSlug}/my-account/bookings/${booking.bookingId}`,
    returnTo,
  );

  const [selectedDate, setSelectedDate] = useState<string | null>(() =>
    initialRescheduleDate({
      currentStart: start,
      now: new Date(),
      timezone,
      window: reschedule.window,
    }),
  );
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<FailureNotice | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expiredByServer, setExpiredByServer] = useState(false);
  const [movedTo, setMovedTo] = useState<BookingWindowFacts | null>(null);

  useEffect(() => {
    setBookingStatus?.(booking.status);
    setBackHrefOverride?.(bookingHref);
    setBackLabelOverride?.(t('backToBooking'));
    return () => {
      setBookingStatus?.(null);
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [booking.status, bookingHref, setBackHrefOverride, setBackLabelOverride, setBookingStatus, t]);

  function describeFailure(failure: RescheduleFailure): FailureNotice {
    if (failure.kind === 'generic') {
      return { title: t('genericTitle'), hint: t('genericHint') };
    }
    return {
      title: resolveErrorMessage(failure.code, locale),
      hint: failure.kind === 'bundleUnavailable' ? t('bundleHint') : t('conflictHint'),
    };
  }

  async function handleConfirm(): Promise<void> {
    if (selectedSlot === null) return;
    setIsSubmitting(true);
    setNotice(null);
    try {
      await rescheduleBookingAsCustomer(booking.bookingId, selectedSlot.startsAt);
      setMovedTo({ start: new Date(selectedSlot.startsAt), end: new Date(selectedSlot.endsAt) });
    } catch (err) {
      const failure = classifyRescheduleFailure(extractProblemCode(err));
      if (failure.kind === 'windowExpired') {
        setExpiredByServer(true);
      } else {
        setNotice(describeFailure(failure));
        if (shouldReloadSlots(failure)) {
          setSelectedSlot(null);
          setReloadKey((key) => key + 1);
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (movedTo !== null) {
    return (
      <RescheduleSuccessView
        serviceNames={serviceNames}
        when={movedTo}
        before={current}
        durationMins={durationMins}
        price={booking.totalPrice.amount}
        bookingHref={bookingHref}
        bookingsHref={`/${tenantSlug}/my-account/bookings`}
      />
    );
  }

  const windowClosed =
    expiredByServer || !canRescheduleBooking({ status: booking.status, reschedule });
  if (windowClosed) {
    return (
      <RescheduleWindowExpiredView
        serviceNames={serviceNames}
        when={current}
        durationMins={durationMins}
        price={booking.totalPrice.amount}
        eligibleUntil={eligibleUntil}
        windowHours={Math.round((start.getTime() - eligibleUntil.getTime()) / MS_PER_HOUR)}
        whatsapp={whatsapp}
        backHref={bookingHref}
      />
    );
  }

  const target: BookingWindowFacts | null =
    selectedSlot === null
      ? null
      : { start: new Date(selectedSlot.startsAt), end: new Date(selectedSlot.endsAt) };

  function renderActionPane(): React.JSX.Element {
    return (
      <RescheduleActionPane
        from={current}
        to={target}
        eligibleUntil={eligibleUntil}
        isSubmitting={isSubmitting}
        backHref={bookingHref}
        onConfirm={() => void handleConfirm()}
      />
    );
  }

  return (
    <div className="w-full">
      <div className="lg:grid lg:grid-cols-[1fr_22rem] lg:items-start lg:gap-6">
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-bold text-gray-900">{t('title')}</h1>

          {notice !== null && (
            <div data-testid="reschedule-error">
              <ErrorAlert hint={notice.hint} focusOnMount variant="dashboard">
                {notice.title}
              </ErrorAlert>
            </div>
          )}

          <div>
            <p className="mb-2.5 text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
              {t('currentSectionLabel')}
            </p>
            <RescheduleBookingFacts
              serviceNames={serviceNames}
              when={current}
              durationMins={durationMins}
              price={booking.totalPrice.amount}
            />
          </div>

          <RescheduleKeptPicks keptPicks={reschedule.keptPicks} />

          <ReschedulePicker
            key={reloadKey}
            tenantSlug={tenantSlug}
            reschedule={reschedule}
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            onSelectDate={(date) => {
              setSelectedDate(date);
              setSelectedSlot(null);
            }}
            onSelectSlot={setSelectedSlot}
          />

          <div data-testid="action-pane-mobile" className="lg:hidden">
            {renderActionPane()}
          </div>
        </div>

        <div data-testid="action-pane-desktop" className="hidden lg:sticky lg:top-6 lg:block">
          {renderActionPane()}
        </div>
      </div>
    </div>
  );
}
