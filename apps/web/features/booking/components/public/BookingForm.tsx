'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type {
  AvailableSlot,
  HotsiteAddressSpec,
  HotsiteServiceResponse,
  CustomerProfileResponse,
} from '@ikaro/types';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import {
  emptyPersonalInfo,
  isAddressBlank,
  type PersonalInfoValue,
} from '@/features/booking/model/personal-info';
import { useBookingSubmission } from '@/features/booking/hooks/useBookingSubmission';
import { AvailabilityStep } from './AvailabilityStep';
import { ErrorAlert } from './ErrorAlert';
import { ConfirmationStep } from './ConfirmationStep';
import { PersonalInfoStep } from './PersonalInfoStep';
import { ServiceSelectionStep } from './ServiceSelectionStep';

interface BookingFormProps {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly carouselDays: number;
  readonly datePickerType: 'carousel' | 'calendar';
  readonly maxBookingAdvanceDays: number;
  readonly phonePrefix: string;
  readonly addressSpec: HotsiteAddressSpec;
}

type Step = 1 | 2 | 3 | 4;

const TOTAL_STEPS = 4;

export function BookingForm({
  slug,
  services,
  carouselDays,
  datePickerType,
  maxBookingAdvanceDays,
  phonePrefix,
  addressSpec,
}: BookingFormProps): React.JSX.Element {
  const t = useTranslations('booking');
  const locale = useResolvedLocale();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfoValue>(emptyPersonalInfo());
  const [customerProfile, setCustomerProfile] = useState<
    CustomerProfileResponse | null | undefined
  >(undefined);
  const [pickupAddressEdited, setPickupAddressEdited] = useState(false);

  const requiresPickupAddress = services.some(
    (service) => selectedServiceIds.includes(service.id) && service.requiresPickupAddress,
  );

  useEffect(() => {
    let active = true;

    getHotsiteCustomerProfile(slug)
      .then((profile) => {
        if (!active) return;
        setCustomerProfile(profile);
      })
      .catch(() => {
        if (active) setCustomerProfile(null);
      });

    return () => {
      active = false;
    };
  }, [slug]);

  const pickupAddress =
    requiresPickupAddress &&
    !pickupAddressEdited &&
    isAddressBlank(personalInfo.pickupAddress) &&
    customerProfile?.defaultAddress
      ? customerProfile.defaultAddress
      : personalInfo.pickupAddress;
  const isAuthenticatedCustomer = customerProfile !== null && customerProfile !== undefined;

  const {
    status,
    errorMessage,
    step1Error,
    step2Error,
    step3Error,
    clearStep2Error,
    handleSubmit,
  } = useBookingSubmission({
    slug,
    customerProfile,
    onCustomerProfileResolved: setCustomerProfile,
    selectedServiceIds,
    selectedSlot,
    pickupAddress,
    requiresPickupAddress,
    personalInfo,
    addressSpec,
    locale,
    onErrorStep: setStep,
  });

  function toggleService(serviceId: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId],
    );
    setSelectedDate(null);
    setSelectedSlot(null);
  }

  function handleSelectDate(date: string) {
    setSelectedDate(date);
    setSelectedSlot(null);
    clearStep2Error();
  }

  function handleSelectSlot(slot: AvailableSlot) {
    setSelectedSlot(slot);
    clearStep2Error();
  }

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <div className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="sr-only">{t('title')}</h1>
        <p className="mb-6 text-sm opacity-75" style={{ color: 'var(--ba-text)' }}>
          {t('stepIndicator', { step, total: TOTAL_STEPS })}
        </p>

        {step === 1 && (
          <>
            <ServiceSelectionStep
              services={services}
              selectedServiceIds={selectedServiceIds}
              onToggleService={toggleService}
              requiresPickupAddress={requiresPickupAddress}
              pickupAddress={pickupAddress}
              onPickupAddressChange={(address) => {
                setPickupAddressEdited(true);
                setPersonalInfo((prev) => ({ ...prev, pickupAddress: address }));
              }}
              addressSpec={addressSpec}
              onNext={() => setStep(2)}
              onBack={() => router.push(`/${slug}`)}
            />
            {step1Error && (
              <div className="mt-4" data-testid="step1-submit-error">
                <ErrorAlert>{step1Error}</ErrorAlert>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <AvailabilityStep
            slug={slug}
            datePickerType={datePickerType}
            selectedServiceIds={selectedServiceIds}
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            carouselDays={carouselDays}
            maxBookingAdvanceDays={maxBookingAdvanceDays}
            onSelectDate={handleSelectDate}
            onSelectSlot={handleSelectSlot}
            error={step2Error}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}

        {step === 3 && selectedDate && selectedSlot && (
          <>
            <PersonalInfoStep
              slug={slug}
              value={personalInfo}
              onChange={setPersonalInfo}
              services={services}
              selectedServiceIds={selectedServiceIds}
              selectedDate={selectedDate}
              selectedSlot={selectedSlot}
              phonePrefix={phonePrefix}
              addressSpec={addressSpec}
              hideContactFields={isAuthenticatedCustomer}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
            {step3Error && (
              <div className="mt-4" data-testid="step3-submit-error">
                <ErrorAlert>{step3Error}</ErrorAlert>
              </div>
            )}
          </>
        )}

        {step === 4 && selectedDate && selectedSlot && (
          <ConfirmationStep
            slug={slug}
            services={services}
            selectedServiceIds={selectedServiceIds}
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            status={status}
            errorMessage={errorMessage}
            onSubmit={handleSubmit}
            onBack={() => setStep(3)}
          />
        )}
      </div>
    </main>
  );
}
