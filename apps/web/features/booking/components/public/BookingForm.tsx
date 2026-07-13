'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { BookingErrorCode } from '@ikaro/types';
import type {
  AvailableSlot,
  Address,
  CreateBookingRequest,
  HotsiteAddressSpec,
  HotsiteServiceResponse,
  CustomerProfileResponse,
  ProblemDetail,
} from '@ikaro/types';
import {
  CreateBookingError,
  createAuthenticatedBooking,
  createBooking,
  type AuthenticatedBookingRequest,
} from '@/features/booking/api/public';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import { ApiError } from '@/shared/lib/api/errors';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import type { SupportedLocale } from '@/shared/lib/i18n/get-messages';
import {
  emptyPersonalInfo,
  isAddressFilled,
  isAddressBlank,
  sanitizeAddress,
  type PersonalInfoValue,
} from '@/features/booking/model/personal-info';
import { AvailabilityCarousel } from './AvailabilityCarousel';
import { ErrorAlert } from './ErrorAlert';
import { ConfirmationStep, type BookingSubmissionStatus } from './ConfirmationStep';
import { PersonalInfoStep } from './PersonalInfoStep';
import { ServiceSelectionStep } from './ServiceSelectionStep';
import { SlotPicker } from './SlotPicker';

interface BookingFormProps {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly carouselDays: number;
  readonly phonePrefix: string;
  readonly addressSpec: HotsiteAddressSpec;
}

type Step = 1 | 2 | 3 | 4;

const TOTAL_STEPS = 4;

function buildPayload(
  personalInfo: PersonalInfoValue,
  selectedServiceIds: readonly string[],
  selectedSlot: AvailableSlot,
  pickupAddress: Address,
  requiresPickupAddress: boolean,
  requireNeighborhood: boolean,
): CreateBookingRequest {
  return {
    contactName: personalInfo.contactName,
    contactEmail: personalInfo.contactEmail,
    contactPhone: personalInfo.contactPhone,
    scheduledAt: selectedSlot.startsAt,
    serviceIds: [...selectedServiceIds],
    ...(isAddressFilled(personalInfo.contactAddress, requireNeighborhood)
      ? { contactAddress: sanitizeAddress(personalInfo.contactAddress) }
      : {}),
    ...(requiresPickupAddress ? { pickupAddress: sanitizeAddress(pickupAddress) } : {}),
    ...(personalInfo.photoFilePaths.length > 0
      ? { beforeServicePhotoUrls: [...personalInfo.photoFilePaths] }
      : {}),
  };
}

interface BookingSubmitErrorRoute {
  readonly step: Step;
  readonly message: string;
}

interface BookingSubmitErrorShape {
  readonly code?: string;
  readonly field?: string;
}

// Guest submissions (createBooking) throw CreateBookingError, a FetchError subclass exposing
// code/field directly. Authenticated submissions (createAuthenticatedBooking) go through
// bffClient and throw ApiError, which carries the same ProblemDetail fields nested under
// `.data` instead — both shapes need to route the same way.
function extractBookingSubmitErrorShape(err: unknown): BookingSubmitErrorShape | null {
  if (err instanceof CreateBookingError) {
    return { code: err.code, field: err.field };
  }
  if (err instanceof ApiError) {
    const data = err.data as ProblemDetail | undefined;
    return { code: data?.code, field: data?.field };
  }
  return null;
}

function resolveBookingSubmitErrorRoute(
  err: unknown,
  locale: SupportedLocale,
): BookingSubmitErrorRoute {
  const shape = extractBookingSubmitErrorShape(err);
  if (!shape) {
    return { step: 4, message: resolveErrorMessage(undefined, locale) };
  }
  if (shape.code === BookingErrorCode.SLOT_UNAVAILABLE) {
    return { step: 2, message: resolveErrorMessage(shape.code, locale) };
  }
  if (shape.field === 'pickupAddress') {
    return { step: 1, message: resolveErrorMessage(shape.code, locale) };
  }
  if (shape.field === 'contactAddress') {
    return { step: 3, message: resolveErrorMessage(shape.code, locale) };
  }
  return { step: 4, message: resolveErrorMessage(shape.code, locale) };
}

function buildAuthenticatedPayload(
  selectedServiceIds: readonly string[],
  selectedSlot: AvailableSlot,
  pickupAddress: Address,
  requiresPickupAddress: boolean,
  photoFilePaths: readonly string[],
): AuthenticatedBookingRequest {
  return {
    scheduledAt: selectedSlot.startsAt,
    serviceIds: [...selectedServiceIds],
    ...(requiresPickupAddress ? { pickupAddress: sanitizeAddress(pickupAddress) } : {}),
    ...(photoFilePaths.length > 0 ? { beforeServicePhotoUrls: [...photoFilePaths] } : {}),
  };
}

export function BookingForm({
  slug,
  services,
  carouselDays,
  phonePrefix,
  addressSpec,
}: BookingFormProps): React.JSX.Element {
  const t = useTranslations('booking');
  const tc = useTranslations('common');
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
  const [status, setStatus] = useState<BookingSubmissionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [step2Error, setStep2Error] = useState<string | null>(null);
  const [step3Error, setStep3Error] = useState<string | null>(null);

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
    setStep2Error(null);
  }

  function handleSelectSlot(slot: AvailableSlot) {
    setSelectedSlot(slot);
    setStep2Error(null);
  }

  async function handleSubmit() {
    if (!selectedSlot) return;

    setStatus('submitting');
    setErrorMessage(null);
    setStep1Error(null);
    setStep2Error(null);
    setStep3Error(null);

    try {
      const resolvedProfile =
        customerProfile === undefined ? await getHotsiteCustomerProfile(slug) : customerProfile;
      if (resolvedProfile !== customerProfile) {
        setCustomerProfile(resolvedProfile);
      }

      if (resolvedProfile) {
        await createAuthenticatedBooking(
          buildAuthenticatedPayload(
            selectedServiceIds,
            selectedSlot,
            pickupAddress,
            requiresPickupAddress,
            personalInfo.photoFilePaths,
          ),
        );
      } else {
        const payload = buildPayload(
          personalInfo,
          selectedServiceIds,
          selectedSlot,
          pickupAddress,
          requiresPickupAddress,
          addressSpec.requireNeighborhood,
        );
        await createBooking(slug, payload);
      }
      setStatus('success');
    } catch (err) {
      const route = resolveBookingSubmitErrorRoute(err, locale);
      setStatus(route.step === 4 ? 'error' : 'idle');
      setStep1Error(route.step === 1 ? route.message : null);
      setStep2Error(route.step === 2 ? route.message : null);
      setStep3Error(route.step === 3 ? route.message : null);
      setErrorMessage(route.step === 4 ? route.message : null);
      setStep(route.step);
    }
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
          <div>
            <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
              {t('availability.heading')}
            </h2>

            <AvailabilityCarousel
              slug={slug}
              serviceIds={selectedServiceIds}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
              carouselDays={carouselDays}
            />

            {selectedDate && (
              <div className="mt-4">
                <SlotPicker
                  slug={slug}
                  serviceIds={selectedServiceIds}
                  date={selectedDate}
                  selectedSlot={selectedSlot}
                  onSelectSlot={handleSelectSlot}
                />
              </div>
            )}

            {step2Error && (
              <div className="mt-4" data-testid="step2-error">
                <ErrorAlert>{step2Error}</ErrorAlert>
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
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
                onClick={() => setStep(3)}
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
