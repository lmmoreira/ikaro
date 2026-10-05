'use client';

import { useMemo, useState } from 'react';
import type { AvailableSlot, HotsiteServiceResponse, ResourceSelectionItem } from '@ikaro/types';
import type { ChosenDuration } from '@/features/booking/model/basket-lines';
import {
  emptyIntakeAnswers,
  type IntakeAnswersValue,
} from '@/features/booking/model/intake-answers';
import { emptyPersonalInfo, type PersonalInfoValue } from '@/features/booking/model/personal-info';

export interface BookingSelections {
  readonly selectedServiceIds: readonly string[];
  readonly selectedServices: readonly HotsiteServiceResponse[];
  readonly selectedDate: string | null;
  readonly selectedSlot: AvailableSlot | null;
  readonly personalInfo: PersonalInfoValue;
  readonly picks: readonly ResourceSelectionItem[];
  readonly intake: IntakeAnswersValue;
  /** The customer-selected duration (and its server quote once resolved); null until chosen. */
  readonly duration: ChosenDuration | null;
  /** Picks a duration: drops any earlier quote and the slot, which was searched with the old one. */
  readonly chooseDuration: (minutes: number) => void;
  /** Stores the server quote for `minutes`; ignored when the customer has since picked another. */
  readonly setQuotedAmount: (minutes: number, amount: number) => void;
  /** Forgets the duration and the slot (a `BOOKING_DURATION_OUT_OF_RANGE` returns here). */
  readonly clearDuration: () => void;
  readonly toggleService: (serviceId: string) => void;
  readonly selectDate: (date: string) => void;
  readonly selectSlot: (slot: AvailableSlot) => void;
  readonly clearSlot: () => void;
  readonly setPersonalInfo: (value: PersonalInfoValue) => void;
  readonly setPicks: (picks: readonly ResourceSelectionItem[]) => void;
  readonly setIntake: (value: IntakeAnswersValue) => void;
}

function useSelectedServices(
  services: readonly HotsiteServiceResponse[],
  selectedServiceIds: readonly string[],
): readonly HotsiteServiceResponse[] {
  return useMemo(
    () => services.filter((service) => selectedServiceIds.includes(service.id)),
    [services, selectedServiceIds],
  );
}

interface DurationInvalidations {
  readonly clearDate: () => void;
  readonly clearSlot: () => void;
}

// The customer-selected duration and its quote. A new duration invalidates what was searched with
// the old one (date and slot); a quote only lands on the duration it was requested for.
function useChosenDuration({ clearDate, clearSlot }: DurationInvalidations) {
  const [duration, setDuration] = useState<ChosenDuration | null>(null);
  return {
    duration,
    resetDuration: () => setDuration(null),
    chooseDuration: (minutes: number) => {
      setDuration({ minutes, quotedAmount: null });
      clearDate();
      clearSlot();
    },
    setQuotedAmount: (minutes: number, amount: number) =>
      setDuration((current) =>
        current?.minutes === minutes && current.quotedAmount !== amount
          ? { minutes, quotedAmount: amount }
          : current,
      ),
    clearDuration: () => {
      setDuration(null);
      clearSlot();
    },
  };
}

// The searched date and the chosen slot: picking another date drops the slot found for the old one.
function useSlotSelection() {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  return {
    selectedDate,
    selectedSlot,
    selectDate: (date: string) => {
      setSelectedDate(date);
      setSelectedSlot(null);
    },
    selectSlot: setSelectedSlot,
    clearSlot: () => setSelectedSlot(null),
    clearDate: () => setSelectedDate(null),
  };
}

// Everything the customer has chosen so far. Changing the selected services invalidates what was
// derived from them — the date and slot, the resource picks, the duration and the intake answers —
// because each belongs to the previous selection's requirements and schema.
export function useBookingSelections(
  services: readonly HotsiteServiceResponse[],
): BookingSelections {
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfoValue>(emptyPersonalInfo());
  const [picks, setPicks] = useState<readonly ResourceSelectionItem[]>([]);
  const [intake, setIntake] = useState<IntakeAnswersValue>(emptyIntakeAnswers());
  const { clearDate, ...slot } = useSlotSelection();
  const { resetDuration, ...chosenDuration } = useChosenDuration({
    clearDate,
    clearSlot: slot.clearSlot,
  });

  const selectedServices = useSelectedServices(services, selectedServiceIds);

  return {
    selectedServiceIds,
    selectedServices,
    personalInfo,
    picks,
    intake,
    ...slot,
    ...chosenDuration,
    toggleService: (serviceId) => {
      setSelectedServiceIds((prev) =>
        prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId],
      );
      clearDate();
      slot.clearSlot();
      setPicks([]);
      resetDuration();
      setIntake(emptyIntakeAnswers());
    },
    setPersonalInfo,
    setPicks,
    setIntake,
  };
}
