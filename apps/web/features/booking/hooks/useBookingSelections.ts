'use client';

import { useMemo, useState } from 'react';
import type { AvailableSlot, HotsiteServiceResponse, ResourceSelectionItem } from '@ikaro/types';
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

// Everything the customer has chosen so far. Changing the selected services invalidates what was
// derived from them — the date and slot, the resource picks and the intake answers — because each
// belongs to the previous selection's requirements and schema.
export function useBookingSelections(
  services: readonly HotsiteServiceResponse[],
): BookingSelections {
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfoValue>(emptyPersonalInfo());
  const [picks, setPicks] = useState<readonly ResourceSelectionItem[]>([]);
  const [intake, setIntake] = useState<IntakeAnswersValue>(emptyIntakeAnswers());

  const selectedServices = useSelectedServices(services, selectedServiceIds);

  return {
    selectedServiceIds,
    selectedServices,
    selectedDate,
    selectedSlot,
    personalInfo,
    picks,
    intake,
    toggleService: (serviceId) => {
      setSelectedServiceIds((prev) =>
        prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId],
      );
      setSelectedDate(null);
      setSelectedSlot(null);
      setPicks([]);
      setIntake(emptyIntakeAnswers());
    },
    selectDate: (date) => {
      setSelectedDate(date);
      setSelectedSlot(null);
    },
    selectSlot: setSelectedSlot,
    clearSlot: () => setSelectedSlot(null),
    setPersonalInfo,
    setPicks,
    setIntake,
  };
}
