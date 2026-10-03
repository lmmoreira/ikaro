import { describe, expect, it } from 'vitest';
import { BookingErrorCode } from '@ikaro/types';
import type { HotsiteServiceLeg, HotsiteServiceResponse } from '@ikaro/types';
import { ApiError, AuthError } from '@/shared/lib/api/errors';
import { choiceRequirement, makeHotsiteService } from '@/test-utils';
import {
  DEFAULT_BOOKING_STEPS,
  pickerUnitKey,
  resolveBookingSteps,
  resolveBookingSubmitErrorRoute,
  resolveErrorStep,
  resolvePickerUnits,
  type BookingStepId,
} from './booking-steps';

const STAFF_ID = '00000000-0000-0000-0000-0000000000a1';
const POOL_ID = '00000000-0000-0000-0000-0000000000a2';
const JOURNEY_ID = '00000000-0000-0000-0000-0000000000a3';
const BUNDLE_ID = '00000000-0000-0000-0000-0000000000a4';

const chosenStaff = makeHotsiteService({
  id: STAFF_ID,
  resourceRequirements: [choiceRequirement('STAFF')],
});
const autoAny = makeHotsiteService({
  resourceRequirements: [{ type: 'STAFF', selectionMode: 'AUTO_ANY', requiredQuantity: 1 }],
});
const pool = makeHotsiteService({
  id: POOL_ID,
  resourceRequirements: [
    { type: 'ROOM', selectionMode: 'AUTO_FUNGIBLE_POOL', requiredQuantity: 2 },
  ],
});
const bundle = makeHotsiteService({
  id: BUNDLE_ID,
  resourceRequirements: [
    choiceRequirement('STAFF'),
    choiceRequirement('ROOM'),
    choiceRequirement('EQUIPMENT'),
  ],
});

function leg(
  legIndex: number,
  name: string,
  choices: ('STAFF' | 'ROOM' | 'EQUIPMENT')[],
): HotsiteServiceLeg {
  return {
    legIndex,
    name,
    durationMinutes: 30,
    transitionGapAfterMinutes: 0,
    resourceRequirements: choices.length
      ? choices.map(choiceRequirement)
      : [{ type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 }],
  };
}

function journey(choicesPerLeg: ('STAFF' | 'ROOM' | 'EQUIPMENT')[][]): HotsiteServiceResponse {
  return makeHotsiteService({
    id: JOURNEY_ID,
    legs: choicesPerLeg.map((choices, index) => leg(index, `Etapa ${index + 1}`, choices)),
  });
}

const steps = (...services: HotsiteServiceResponse[]) => ({ services, hasIntake: false });

describe('resolveBookingSteps', () => {
  it('keeps the default four steps without intake or a choice', () => {
    expect(resolveBookingSteps(steps(makeHotsiteService()))).toEqual(DEFAULT_BOOKING_STEPS);
  });

  it('adds the intake step after personal info', () => {
    expect(resolveBookingSteps({ services: [makeHotsiteService()], hasIntake: true })).toEqual([
      'services',
      'availability',
      'personal',
      'intake',
      'confirmation',
    ]);
  });

  it('adds one picker step for a chosen-staff service (5), 6 with intake', () => {
    const base = resolveBookingSteps(steps(chosenStaff));
    expect(base).toHaveLength(5);
    expect(base[1]).toBe(`picker:${STAFF_ID}:-`);
    expect(resolveBookingSteps({ services: [chosenStaff], hasIntake: true })).toHaveLength(6);
  });

  it('adds no picker step for auto-any or pool services', () => {
    expect(resolveBookingSteps(steps(autoAny))).toHaveLength(4);
    expect(resolveBookingSteps(steps(pool))).toHaveLength(4);
  });

  it('keeps several CUSTOMER_CHOICE sections of a flat service in one step', () => {
    expect(resolveBookingSteps(steps(bundle))).toHaveLength(5);
  });

  it('adds a picker step only for the legs that have a choice, in leg order', () => {
    const list = resolveBookingSteps(steps(journey([[], ['STAFF', 'ROOM'], ['EQUIPMENT']])));
    expect(list).toEqual([
      'services',
      `picker:${JOURNEY_ID}:1`,
      `picker:${JOURNEY_ID}:2`,
      'availability',
      'personal',
      'confirmation',
    ]);
    expect(
      resolveBookingSteps({ services: [journey([[], ['STAFF'], ['ROOM']])], hasIntake: true }),
    ).toHaveLength(7);
  });

  it('adds three picker steps when every leg has a choice and none when no leg does', () => {
    expect(resolveBookingSteps(steps(journey([['STAFF'], ['ROOM'], ['EQUIPMENT']])))).toHaveLength(
      7,
    );
    expect(resolveBookingSteps(steps(journey([[], [], []])))).toHaveLength(4);
  });
});

describe('resolvePickerUnits', () => {
  it('names the leg for a leg unit and none for a flat unit', () => {
    const units = resolvePickerUnits([chosenStaff, journey([[], ['STAFF']])]);
    expect(units).toEqual([
      { key: pickerUnitKey(STAFF_ID, null), serviceId: STAFF_ID, legIndex: null, legName: null },
      { key: pickerUnitKey(JOURNEY_ID, 1), serviceId: JOURNEY_ID, legIndex: 1, legName: 'Etapa 2' },
    ]);
  });
});

function problem(code: string, field?: string): ApiError {
  return new ApiError(422, 'detail', { code, field });
}

describe('resolveBookingSubmitErrorRoute', () => {
  const cases: [string, string | undefined, string][] = [
    [BookingErrorCode.SLOT_UNAVAILABLE, undefined, 'availability'],
    [BookingErrorCode.BUNDLE_PARTIALLY_UNAVAILABLE, undefined, 'availability'],
    [BookingErrorCode.LEG_UNAVAILABLE, undefined, 'availability'],
    [BookingErrorCode.DURATION_OUT_OF_RANGE, 'durationMinutes', 'duration'],
    [BookingErrorCode.RESOURCE_SELECTION_REQUIRED, undefined, 'picker'],
    [BookingErrorCode.SERVICE_RESOURCE_TYPE_UNAVAILABLE, undefined, 'picker'],
    [BookingErrorCode.INTAKE_ANSWER_MISSING, undefined, 'intake'],
    [BookingErrorCode.INVALID_MULTIPLE_VARIABLE_SERVICES, undefined, 'services'],
    [BookingErrorCode.SERVICE_NOT_ACTIVE, undefined, 'services'],
    [BookingErrorCode.PICKUP_ADDRESS_REQUIRED, 'pickupAddress', 'services'],
    [BookingErrorCode.PICKUP_ADDRESS_REQUIRED, 'contactAddress', 'personal'],
    ['BOOKING_SOMETHING_ELSE', undefined, 'confirmation'],
  ];

  it.each(cases)('routes %s (field %s) to %s', (code, field, target) => {
    expect(resolveBookingSubmitErrorRoute(problem(code, field), 'pt-BR').target).toBe(target);
  });

  it('resolves the catalogue message of the code', () => {
    expect(
      resolveBookingSubmitErrorRoute(problem(BookingErrorCode.SLOT_UNAVAILABLE), 'pt-BR').message,
    ).toBe('O horário solicitado não está mais disponível.');
  });

  it('sends a 401 to the login', () => {
    expect(resolveBookingSubmitErrorRoute(new AuthError('x'), 'pt-BR').target).toBe('login');
  });

  it('falls back to Confirmation with the generic message for a non-API error', () => {
    const route = resolveBookingSubmitErrorRoute(new Error('network'), 'pt-BR');
    expect(route).toEqual({
      target: 'confirmation',
      message: 'Algo deu errado. Tente novamente.',
      code: undefined,
    });
  });
});

describe('resolveErrorStep', () => {
  const list: BookingStepId[] = [
    'services',
    'picker:a:-',
    'availability',
    'personal',
    'confirmation',
  ];

  it('returns the targeted step when it is in the list', () => {
    const route = { target: 'availability' as const, message: 'm' };
    expect(resolveErrorStep({ ...route, code: 'X' }, list, 'pt-BR', null)).toEqual({
      kind: 'step',
      stepId: 'availability',
      message: 'm',
      code: 'X',
    });
  });

  it('uses the first invalid picker step for a picker route', () => {
    const route = { target: 'picker' as const, message: 'm' };
    expect(resolveErrorStep(route, list, 'pt-BR', 'picker:a:-')).toMatchObject({
      stepId: 'picker:a:-',
    });
  });

  it('falls back to Confirmation with the generic message for an unknown step id', () => {
    const route = { target: 'duration' as const, message: 'm' };
    expect(resolveErrorStep(route, list, 'pt-BR', null)).toEqual({
      kind: 'step',
      stepId: 'confirmation',
      message: 'Algo deu errado. Tente novamente.',
    });
  });

  it('falls back when a picker route has no invalid picker step', () => {
    const route = { target: 'picker' as const, message: 'm' };
    expect(resolveErrorStep(route, list, 'pt-BR', null)).toMatchObject({ stepId: 'confirmation' });
  });

  it('returns login for the login route', () => {
    expect(resolveErrorStep({ target: 'login', message: 'm' }, list, 'pt-BR', null)).toEqual({
      kind: 'login',
    });
  });
});
