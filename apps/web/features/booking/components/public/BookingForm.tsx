'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { HotsiteAddressSpec, HotsiteServiceResponse } from '@ikaro/types';
import { useBookingFormController } from '@/features/booking/hooks/useBookingFormController';
import { pickerStepId, resolvePickerUnits } from '@/features/booking/model/booking-steps';
import { resolveBasketBookingWindow } from '@/features/booking/model/booking-window';
import { findVariableDurationService } from '@/features/booking/model/duration-options';
import { AvailabilityStep } from './AvailabilityStep';
import { ConfirmationStep } from './ConfirmationStep';
import { ErrorAlert } from './ErrorAlert';
import { IntakeAnswersStep } from './IntakeAnswersStep';
import { PersonalInfoStep } from './PersonalInfoStep';
import { ResourcePickerStep } from './ResourcePickerStep';
import { ServiceSelectionStep } from './ServiceSelectionStep';
import { VariableDurationStep } from './VariableDurationStep';

interface BookingFormProps {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly carouselDays: number;
  readonly datePickerType: 'carousel' | 'calendar';
  readonly maxBookingAdvanceDays: number;
  readonly timezone: string;
  readonly phonePrefix: string;
  readonly addressSpec: HotsiteAddressSpec;
}

export function BookingForm({
  slug,
  services,
  carouselDays,
  datePickerType,
  maxBookingAdvanceDays,
  timezone,
  phonePrefix,
  addressSpec,
}: BookingFormProps): React.JSX.Element {
  const t = useTranslations('booking');
  const router = useRouter();
  const c = useBookingFormController({ slug, services, addressSpec });
  const { flow, selections, formData, submission } = c;
  const { selectedServiceIds, selectedServices, selectedDate, selectedSlot } = selections;
  const { stepId } = flow;
  const pickerUnit = resolvePickerUnits(selectedServices).find(
    (unit) => pickerStepId(unit) === stepId,
  );
  const pickerService = selectedServices.find((service) => service.id === pickerUnit?.serviceId);
  const durationService = findVariableDurationService(selectedServices);
  const bookingWindow = resolveBasketBookingWindow(selectedServices, maxBookingAdvanceDays);

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="sr-only">{t('title')}</h1>
        <p className="mb-6 text-sm opacity-75" style={{ color: 'var(--ba-text)' }}>
          {t('stepIndicator', { step: flow.position, total: flow.total })}
        </p>

        {stepId === 'services' && (
          <ServiceSelectionStep
            services={c.bookable}
            selectedServiceIds={selectedServiceIds}
            onToggleService={c.toggleService}
            requiresPickupAddress={c.requiresPickupAddress}
            pickupAddress={c.pickupAddress}
            onPickupAddressChange={c.editPickupAddress}
            addressSpec={addressSpec}
            formStatus={formData.status}
            unavailableServiceIds={formData.unavailableServiceIds}
            submitError={flow.errors.services ?? null}
            onNext={c.leaveServicesStep}
            onBack={() => router.push(`/${slug}`)}
          />
        )}

        {pickerUnit && pickerService && (
          <ResourcePickerStep
            unit={pickerUnit}
            service={pickerService}
            requirements={formData.requirements}
            picks={selections.picks}
            status={c.pickerStatus}
            reselectMessage={flow.errors[stepId]?.message ?? null}
            onPick={c.pick}
            onRetry={c.retryPickerOptions}
            onBack={flow.goBack}
            onNext={flow.goNext}
          />
        )}

        {stepId === 'duration' && durationService && (
          <VariableDurationStep
            slug={slug}
            service={durationService}
            duration={selections.duration}
            error={flow.errors.duration ?? null}
            onChooseDuration={c.chooseDuration}
            onQuoted={selections.setQuotedAmount}
            onBack={flow.goBack}
            onNext={flow.goNext}
          />
        )}

        {stepId === 'availability' && (
          <AvailabilityStep
            slug={slug}
            datePickerType={datePickerType}
            selectedServiceIds={selectedServiceIds}
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            carouselDays={carouselDays}
            maxBookingAdvanceDays={bookingWindow.maxAdvanceDays}
            minBookingAdvanceHours={bookingWindow.minAdvanceHours}
            timezone={timezone}
            onSelectDate={c.selectDate}
            onSelectSlot={c.selectSlot}
            resourceSelections={c.resourceSelections}
            durationMinutes={selections.duration?.minutes}
            error={flow.errors.availability ?? null}
            onBack={flow.goBack}
            onNext={flow.goNext}
          />
        )}

        {stepId === 'personal' && selectedDate && selectedSlot && (
          <>
            <PersonalInfoStep
              slug={slug}
              value={selections.personalInfo}
              onChange={selections.setPersonalInfo}
              services={c.bookable}
              selectedServiceIds={selectedServiceIds}
              selectedDate={selectedDate}
              selectedSlot={selectedSlot}
              phonePrefix={phonePrefix}
              addressSpec={addressSpec}
              hideContactFields={c.isAuthenticatedCustomer}
              picks={selections.picks}
              requirements={formData.requirements}
              duration={selections.duration}
              onNext={flow.goNext}
              onBack={flow.goBack}
            />
            {flow.errors.personal && (
              <div className="mt-4" data-testid="step3-submit-error">
                <ErrorAlert focusOnMount>{flow.errors.personal.message}</ErrorAlert>
              </div>
            )}
          </>
        )}

        {stepId === 'intake' && formData.intakeSchema && (
          <IntakeAnswersStep
            schema={formData.intakeSchema}
            value={selections.intake}
            onChange={selections.setIntake}
            serverError={flow.errors.intake?.message ?? null}
            onNext={flow.goNext}
            onBack={flow.goBack}
          />
        )}

        {stepId === 'confirmation' && selectedDate && selectedSlot && (
          <ConfirmationStep
            slug={slug}
            services={c.bookable}
            selectedServiceIds={selectedServiceIds}
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            status={submission.status}
            errorMessage={flow.errors.confirmation?.message ?? null}
            booking={submission.booking}
            picks={selections.picks}
            requirements={formData.requirements}
            duration={selections.duration}
            onSubmit={submission.handleSubmit}
            onBack={flow.goBack}
          />
        )}
      </div>
    </main>
  );
}
