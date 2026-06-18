'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AvailableSlot, CreateBookingRequest, HotsiteServiceResponse } from '@ikaro/types';
import { CreateBookingError, createBooking } from '@/lib/api/bookings';
import {
  emptyPersonalInfo,
  isAddressFilled,
  type PersonalInfoValue,
} from '@/lib/booking/personal-info';
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
}

type Step = 1 | 2 | 3 | 4;

const TOTAL_STEPS = 4;
const GENERIC_ERROR_MESSAGE = 'Não foi possível enviar sua solicitação. Tente novamente.';
const SLOT_TAKEN_MESSAGE = 'Horário indisponível, escolha outro';

function buildPayload(
  personalInfo: PersonalInfoValue,
  selectedServiceIds: readonly string[],
  selectedSlot: AvailableSlot,
  requiresPickupAddress: boolean,
): CreateBookingRequest {
  return {
    contactName: personalInfo.contactName,
    contactEmail: personalInfo.contactEmail,
    contactPhone: personalInfo.contactPhone,
    scheduledAt: selectedSlot.startsAt,
    serviceIds: [...selectedServiceIds],
    ...(isAddressFilled(personalInfo.contactAddress)
      ? { contactAddress: personalInfo.contactAddress }
      : {}),
    ...(requiresPickupAddress ? { pickupAddress: personalInfo.pickupAddress } : {}),
    ...(personalInfo.photoFilePaths.length > 0
      ? { beforeServicePhotoUrls: [...personalInfo.photoFilePaths] }
      : {}),
  };
}

export function BookingForm({ slug, services, carouselDays }: BookingFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfoValue>(emptyPersonalInfo());
  const [status, setStatus] = useState<BookingSubmissionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [step2Error, setStep2Error] = useState<string | null>(null);

  const requiresPickupAddress = services.some(
    (service) => selectedServiceIds.includes(service.id) && service.requiresPickupAddress,
  );

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

    try {
      const payload = buildPayload(
        personalInfo,
        selectedServiceIds,
        selectedSlot,
        requiresPickupAddress,
      );
      await createBooking(slug, payload);
      setStatus('success');
    } catch (err) {
      if (err instanceof CreateBookingError && err.status === 409) {
        setStatus('idle');
        setStep2Error(SLOT_TAKEN_MESSAGE);
        setStep(2);
        return;
      }
      setStatus('error');
      setErrorMessage(GENERIC_ERROR_MESSAGE);
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <div className="mx-auto max-w-2xl px-6 py-12">
        <p className="mb-6 text-sm opacity-75" style={{ color: 'var(--ba-text)' }}>
          Passo {step} de {TOTAL_STEPS}
        </p>

        {step === 1 && (
          <ServiceSelectionStep
            services={services}
            selectedServiceIds={selectedServiceIds}
            onToggleService={toggleService}
            requiresPickupAddress={requiresPickupAddress}
            pickupAddress={personalInfo.pickupAddress}
            onPickupAddressChange={(address) =>
              setPersonalInfo((prev) => ({ ...prev, pickupAddress: address }))
            }
            onNext={() => setStep(2)}
            onBack={() => router.push(`/${slug}`)}
          />
        )}

        {step === 2 && (
          <div>
            <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
              Escolha data e horário
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
                className="border px-6 py-3"
                style={{
                  borderRadius: 'var(--ba-radius)',
                  borderColor: 'var(--ba-secondary)',
                  color: 'var(--ba-text)',
                }}
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={!selectedSlot}
                onClick={() => setStep(3)}
                style={{
                  backgroundColor: 'var(--ba-btn-bg)',
                  color: 'var(--ba-btn-text)',
                  borderColor: 'var(--ba-btn-border)',
                  borderRadius: 'var(--ba-radius)',
                }}
                className="border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {step === 3 && selectedDate && selectedSlot && (
          <PersonalInfoStep
            slug={slug}
            value={personalInfo}
            onChange={setPersonalInfo}
            services={services}
            selectedServiceIds={selectedServiceIds}
            selectedDate={selectedDate}
            selectedSlot={selectedSlot}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
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
    </div>
  );
}
