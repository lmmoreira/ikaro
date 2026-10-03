'use client';

import { useCallback, useState } from 'react';
import type {
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ServiceIntakeSchemaVersion,
} from '@ikaro/types';
import {
  fetchPublicIntakeSchema,
  fetchServiceResourceOptions,
} from '@/features/booking/api/public';
import { resolvePickerUnits } from '@/features/booking/model/booking-steps';

export type BookingFormDataStatus = 'idle' | 'loading' | 'error' | 'ready';

export interface BookingFormData {
  readonly status: BookingFormDataStatus;
  readonly intakeSchema: ServiceIntakeSchemaVersion | null;
  readonly requirements: readonly HotsiteServiceResourceOptionsRequirement[];
  readonly unavailableServiceIds: readonly string[];
}

export type BookingFormDataOutcome =
  { readonly kind: 'ready'; readonly data: BookingFormData } | { readonly kind: 'error' };

interface UseBookingFormDataParams {
  readonly slug: string;
  readonly selectedServices: readonly HotsiteServiceResponse[];
}

interface UseBookingFormDataResult {
  readonly data: BookingFormData;
  readonly load: () => Promise<BookingFormDataOutcome>;
  readonly refetchOptions: () => Promise<
    readonly HotsiteServiceResourceOptionsRequirement[] | null
  >;
}

interface Stored extends BookingFormData {
  readonly key: string;
}

const IDLE: BookingFormData = {
  status: 'idle',
  intakeSchema: null,
  requirements: [],
  unavailableServiceIds: [],
};

function unavailableOf(
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
): string[] {
  return [
    ...new Set(requirements.filter((req) => req.options.length === 0).map((req) => req.serviceId)),
  ];
}

async function fetchRequirements(
  slug: string,
  services: readonly HotsiteServiceResponse[],
): Promise<HotsiteServiceResourceOptionsRequirement[]> {
  const choiceServiceIds = [...new Set(resolvePickerUnits(services).map((unit) => unit.serviceId))];
  const responses = await Promise.all(
    choiceServiceIds.map((id) => fetchServiceResourceOptions(slug, id)),
  );
  return responses.flatMap((response) => response.requirements);
}

async function fetchFirstIntakeSchema(
  slug: string,
  services: readonly HotsiteServiceResponse[],
): Promise<ServiceIntakeSchemaVersion | null> {
  const responses = await Promise.all(
    services.map((service) => fetchPublicIntakeSchema(slug, service.id)),
  );
  return responses.find((response) => response.active !== null)?.active ?? null;
}

async function fetchReadyData(
  slug: string,
  services: readonly HotsiteServiceResponse[],
): Promise<BookingFormData> {
  const [intakeSchema, requirements] = await Promise.all([
    fetchFirstIntakeSchema(slug, services),
    fetchRequirements(slug, services),
  ]);
  return {
    status: 'ready',
    intakeSchema,
    requirements,
    unavailableServiceIds: unavailableOf(requirements),
  };
}

// The intake schemas and the resource options of the selected services are fetched once per
// selection and kept for the whole session (back/forward never re-fetches); a different selection
// is a different key, so the stored result is simply ignored and the next load() fetches again.
// A response for a superseded key never overwrites the state of the newer selection.
export function useBookingFormData({
  slug,
  selectedServices,
}: UseBookingFormDataParams): UseBookingFormDataResult {
  const key = selectedServices.map((service) => service.id).join(',');
  const [stored, setStored] = useState<Stored | null>(null);
  const data = stored?.key === key ? stored : IDLE;

  const load = useCallback(async (): Promise<BookingFormDataOutcome> => {
    if (data.status === 'ready') return { kind: 'ready', data };
    setStored({ ...IDLE, key, status: 'loading' });
    try {
      const ready = await fetchReadyData(slug, selectedServices);
      setStored((prev) => (prev && prev.key !== key ? prev : { ...ready, key }));
      return { kind: 'ready', data: ready };
    } catch {
      setStored((prev) => (prev && prev.key !== key ? prev : { ...IDLE, key, status: 'error' }));
      return { kind: 'error' };
    }
  }, [data, key, slug, selectedServices]);

  const refetchOptions = useCallback(async () => {
    try {
      const requirements = await fetchRequirements(slug, selectedServices);
      setStored((prev) =>
        prev?.key === key
          ? { ...prev, requirements, unavailableServiceIds: unavailableOf(requirements) }
          : prev,
      );
      return requirements;
    } catch {
      return null;
    }
  }, [key, slug, selectedServices]);

  return { data, load, refetchOptions };
}
