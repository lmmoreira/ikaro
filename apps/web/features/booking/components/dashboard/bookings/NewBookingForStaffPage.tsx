'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type {
  CustomerProfileResponse,
  HotsiteAddressSpec,
  HotsiteServiceResponse,
} from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useStaffBookingFormController } from '@/features/booking/hooks/useStaffBookingFormController';
import { useStaffGuestContact } from '@/features/booking/hooks/useStaffGuestContact';
import { pickerStepId, resolvePickerUnits } from '@/features/booking/model/booking-steps';
import { resolveBasketBookingWindow } from '@/features/booking/model/booking-window';
import { findVariableDurationService } from '@/features/booking/model/duration-options';
import { classifyStaffBookingFailure } from '@/features/booking/model/staff-booking-failure';
import type { StaffBookingRecipient } from '@/features/booking/model/staff-booking-payload';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { NewBookingFailureOutcome, NewBookingCreatedOutcome } from './NewBookingOutcome';
import { NewBookingSummaryCard } from './NewBookingSummaryCard';
import { NewBookingAvailabilityStep } from './new-booking/NewBookingAvailabilityStep';
import { NewBookingConfirmStep } from './new-booking/NewBookingConfirmStep';
import { NewBookingDurationStep } from './new-booking/NewBookingDurationStep';
import { NewBookingIntakeStep } from './new-booking/NewBookingIntakeStep';
import { NewBookingResourcePickerStep } from './new-booking/NewBookingResourcePickerStep';
import { NewBookingServicesStep } from './new-booking/NewBookingServicesStep';

interface NewBookingForStaffPageProps {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly timezone: string;
  readonly maxBookingAdvanceDays: number;
  readonly addressSpec: HotsiteAddressSpec;
  /** The registered customer chosen in the chooser (`?customerId=`); null for a new contact. */
  readonly customer: CustomerProfileResponse | null;
}

function RecipientHeader({
  name,
  detail,
  tag,
  stepText,
}: {
  readonly name: string;
  readonly detail: string;
  readonly tag: string;
  readonly stepText: string;
}): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.booking');
  return (
    <Card data-testid="recipient-header">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
          <p className="truncate text-xs text-gray-500">
            {detail} · {tag}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-500" data-testid="step-indicator">
            {stepText}
          </span>
          <Link
            href="/dashboard/bookings/new"
            className="font-semibold text-blue-700 hover:underline"
            data-testid="change-recipient"
          >
            {t('change')}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// `/dashboard/bookings/new/booking` (UC-108): the public flow's step engine, in the dashboard's
// own screens. The recipient is the chosen customer (from the URL) or the contact typed for a new
// person (in memory); without either the page returns to the chooser.
export function NewBookingForStaffPage({
  slug,
  services,
  timezone,
  maxBookingAdvanceDays,
  addressSpec,
  customer,
}: NewBookingForStaffPageProps): React.JSX.Element | null {
  const router = useRouter();
  const t = useTranslations('dashboard.newBooking.booking');
  const tb = useTranslations('booking');
  const { formatDateLong, formatTime } = useFormatting();
  const guest = useStaffGuestContact();

  const recipient = useMemo<StaffBookingRecipient | null>(() => {
    if (customer) return { kind: 'customer', customerId: customer.customerId };
    return guest && { kind: 'guest', ...guest };
  }, [customer, guest]);
  const c = useStaffBookingFormController({
    slug,
    services,
    recipient: recipient ?? { kind: 'guest', contactName: '', contactPhone: '', contactEmail: '' },
    defaultAddress: customer?.defaultAddress,
  });

  useEffect(() => {
    if (!recipient) router.replace('/dashboard/bookings/new');
  }, [recipient, router]);
  if (!recipient) return null;

  const { flow, selections, formData, submission } = c;
  const { selectedServices, selectedDate, selectedSlot, picks, duration } = selections;
  const recipientName = customer?.name ?? guest?.contactName ?? '';
  const bookingWindow = resolveBasketBookingWindow(selectedServices, maxBookingAdvanceDays);
  const pickerUnit = resolvePickerUnits(selectedServices).find(
    (unit) => pickerStepId(unit) === flow.stepId,
  );
  const pickerService = selectedServices.find((s) => s.id === pickerUnit?.serviceId);
  const durationService = findVariableDurationService(selectedServices);
  const goToChooser = () => router.push('/dashboard/bookings/new');
  const summary = (
    <NewBookingSummaryCard
      recipientName={recipientName}
      services={c.bookable}
      selectedServiceIds={selections.selectedServiceIds}
      picks={picks}
      requirements={formData.requirements}
      duration={duration}
      slot={selectedSlot}
    />
  );
  const start = selectedSlot ? new Date(selectedSlot.startsAt) : null;

  const header = (
    <RecipientHeader
      name={recipientName}
      detail={customer ? customer.email : (guest?.contactEmail ?? '')}
      tag={customer ? t('registeredTag') : t('guestTag')}
      stepText={tb('stepIndicator', { step: flow.position, total: flow.total })}
    />
  );

  if (submission.status === 'success' && submission.booking) {
    return (
      <NewBookingCreatedOutcome
        booking={submission.booking}
        recipientName={recipientName}
        recap={summary}
        whenText={start ? `${formatDateLong(start)} · ${formatTime(start)}` : ''}
      />
    );
  }

  const confirmationError = flow.errors.confirmation;
  if (flow.stepId === 'confirmation' && confirmationError) {
    return (
      <NewBookingFailureOutcome
        kind={classifyStaffBookingFailure(confirmationError.code)}
        recipientName={recipientName}
        message={confirmationError.message}
        recap={summary}
        onRetry={() => void submission.handleSubmit()}
        onChooseDate={() => {
          flow.setError('confirmation', null);
          selections.clearSlot();
          flow.goTo('availability');
        }}
      />
    );
  }

  return (
    <div className="space-y-4" data-testid="new-booking-page">
      {header}

      {flow.stepId === 'services' && (
        <NewBookingServicesStep
          services={c.bookable}
          selectedServiceIds={selections.selectedServiceIds}
          onToggleService={c.toggleService}
          requiresPickupAddress={c.requiresPickupAddress}
          pickupAddress={c.pickupAddress}
          onPickupAddressChange={c.editPickupAddress}
          addressSpec={addressSpec}
          formStatus={formData.status}
          unavailableServiceIds={formData.unavailableServiceIds}
          submitError={flow.errors.services ?? null}
          summary={summary}
          onNext={() => void c.leaveServicesStep()}
          onBack={goToChooser}
        />
      )}

      {pickerUnit && pickerService && (
        <NewBookingResourcePickerStep
          unit={pickerUnit}
          service={pickerService}
          requirements={formData.requirements}
          picks={picks}
          status={c.pickerStatus}
          reselectMessage={flow.errors[flow.stepId]?.message ?? null}
          onPick={c.pick}
          onRetry={c.retryPickerOptions}
          summary={summary}
          onBack={flow.goBack}
          onNext={flow.goNext}
        />
      )}

      {flow.stepId === 'duration' && durationService && (
        <NewBookingDurationStep
          slug={slug}
          service={durationService}
          duration={duration}
          error={flow.errors.duration ?? null}
          onChooseDuration={c.chooseDuration}
          onQuoted={selections.setQuotedAmount}
          summary={summary}
          onBack={flow.goBack}
          onNext={flow.goNext}
        />
      )}

      {flow.stepId === 'availability' && (
        <NewBookingAvailabilityStep
          slug={slug}
          selectedServiceIds={selections.selectedServiceIds}
          selectedDate={selectedDate}
          selectedSlot={selectedSlot}
          maxBookingAdvanceDays={bookingWindow.maxAdvanceDays}
          minBookingAdvanceHours={bookingWindow.minAdvanceHours}
          timezone={timezone}
          resourceSelections={c.resourceSelections}
          durationMinutes={duration?.minutes}
          error={flow.errors.availability ?? null}
          onSelectDate={c.selectDate}
          onSelectSlot={c.selectSlot}
          summary={summary}
          onBack={flow.goBack}
          onNext={flow.goNext}
        />
      )}

      {flow.stepId === 'intake' && formData.intakeSchema && (
        <NewBookingIntakeStep
          schema={formData.intakeSchema}
          value={selections.intake}
          onChange={selections.setIntake}
          serverError={flow.errors.intake?.message ?? null}
          summary={summary}
          onBack={flow.goBack}
          onNext={flow.goNext}
        />
      )}

      {flow.stepId === 'confirmation' && selectedDate && selectedSlot && (
        <NewBookingConfirmStep
          status={submission.status}
          summary={summary}
          onBack={flow.goBack}
          onSubmit={() => void submission.handleSubmit()}
        />
      )}
    </div>
  );
}
