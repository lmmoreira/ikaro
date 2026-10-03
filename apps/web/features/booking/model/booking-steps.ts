import { BookingErrorCode } from '@ikaro/types';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { AuthError, extractProblemDetailShape } from '@/shared/lib/api/errors';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import type { SupportedLocale } from '@/shared/lib/i18n/get-messages';

export type BookingStepId =
  | 'services'
  | 'availability'
  | 'personal'
  | 'intake'
  | 'confirmation'
  | 'duration'
  | `picker:${string}`;

export interface PickerUnit {
  readonly key: string;
  readonly serviceId: string;
  readonly legIndex: number | null;
  readonly legName: string | null;
}

export const DEFAULT_BOOKING_STEPS: readonly BookingStepId[] = [
  'services',
  'availability',
  'personal',
  'confirmation',
];

export function pickerUnitKey(serviceId: string, legIndex: number | null): string {
  return `${serviceId}:${legIndex ?? '-'}`;
}

export function pickerStepId(unit: PickerUnit): BookingStepId {
  return `picker:${unit.key}`;
}

export function isPickerStepId(stepId: BookingStepId): stepId is `picker:${string}` {
  return stepId.startsWith('picker:');
}

function hasCustomerChoice(requirements: readonly { readonly selectionMode: string }[]): boolean {
  return requirements.some((requirement) => requirement.selectionMode === 'CUSTOMER_CHOICE');
}

function unitsOfService(service: HotsiteServiceResponse): PickerUnit[] {
  if (service.legs && service.legs.length > 0) {
    return service.legs
      .filter((leg) => hasCustomerChoice(leg.resourceRequirements))
      .map((leg) => ({
        key: pickerUnitKey(service.id, leg.legIndex),
        serviceId: service.id,
        legIndex: leg.legIndex,
        legName: leg.name,
      }));
  }
  return hasCustomerChoice(service.resourceRequirements)
    ? [
        {
          key: pickerUnitKey(service.id, null),
          serviceId: service.id,
          legIndex: null,
          legName: null,
        },
      ]
    : [];
}

/** One unit per flat service/bundle with a CUSTOMER_CHOICE requirement, one per leg that has one. */
export function resolvePickerUnits(services: readonly HotsiteServiceResponse[]): PickerUnit[] {
  return services.flatMap(unitsOfService);
}

export interface ResolveBookingStepsInput {
  readonly services: readonly HotsiteServiceResponse[];
  readonly hasIntake: boolean;
}

/**
 * The ordered step list for the selected services. Every picker step precedes the (S11b)
 * duration step, which precedes availability: the slot search needs every pick and the duration.
 */
export function resolveBookingSteps(input: ResolveBookingStepsInput): BookingStepId[] {
  return [
    'services',
    ...resolvePickerUnits(input.services).map(pickerStepId),
    'availability',
    'personal',
    ...(input.hasIntake ? (['intake'] as const) : []),
    'confirmation',
  ];
}

export type BookingErrorTarget = BookingStepId | 'picker' | 'login';

export interface BookingSubmitErrorRoute {
  readonly target: BookingErrorTarget;
  readonly message: string;
  readonly code?: string;
}

const CODE_TARGETS: Readonly<Record<string, BookingErrorTarget>> = {
  [BookingErrorCode.SLOT_UNAVAILABLE]: 'availability',
  [BookingErrorCode.BUNDLE_PARTIALLY_UNAVAILABLE]: 'availability',
  [BookingErrorCode.LEG_UNAVAILABLE]: 'availability',
  [BookingErrorCode.DURATION_OUT_OF_RANGE]: 'duration',
  [BookingErrorCode.RESOURCE_SELECTION_REQUIRED]: 'picker',
  [BookingErrorCode.SERVICE_RESOURCE_TYPE_UNAVAILABLE]: 'picker',
  [BookingErrorCode.INTAKE_ANSWER_MISSING]: 'intake',
  [BookingErrorCode.INVALID_MULTIPLE_VARIABLE_SERVICES]: 'services',
  [BookingErrorCode.SERVICE_NOT_ACTIVE]: 'services',
};

const FIELD_TARGETS: Readonly<Record<string, BookingErrorTarget>> = {
  pickupAddress: 'services',
  contactAddress: 'personal',
};

export function resolveBookingSubmitErrorRoute(
  err: unknown,
  locale: SupportedLocale,
): BookingSubmitErrorRoute {
  if (err instanceof AuthError) {
    return { target: 'login', message: resolveErrorMessage(undefined, locale) };
  }
  const shape = extractProblemDetailShape(err);
  if (!shape) {
    return { target: 'confirmation', message: resolveErrorMessage(undefined, locale) };
  }
  const target =
    (shape.code ? CODE_TARGETS[shape.code] : undefined) ??
    (shape.field ? FIELD_TARGETS[shape.field] : undefined) ??
    'confirmation';
  return { target, message: resolveErrorMessage(shape.code, locale), code: shape.code };
}

export type ResolvedErrorStep =
  | { readonly kind: 'login' }
  | {
      readonly kind: 'step';
      readonly stepId: BookingStepId;
      readonly message: string;
      readonly code?: string;
    };

/**
 * Maps a route to a step of the current list. A target that is not in the list (for example the
 * S11b duration step before it exists) falls back to Confirmation with the generic message, so the
 * customer is never left on a step that cannot render the error.
 */
export function resolveErrorStep(
  route: BookingSubmitErrorRoute,
  steps: readonly BookingStepId[],
  locale: SupportedLocale,
  invalidPickerStepId: BookingStepId | null,
): ResolvedErrorStep {
  if (route.target === 'login') return { kind: 'login' };
  const stepId = route.target === 'picker' ? invalidPickerStepId : route.target;
  if (stepId && steps.includes(stepId)) {
    return { kind: 'step', stepId, message: route.message, code: route.code };
  }
  return { kind: 'step', stepId: 'confirmation', message: resolveErrorMessage(undefined, locale) };
}
