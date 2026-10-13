import { describe, expect, it } from 'vitest';
import { choiceRequirement, makeHotsiteService } from '@/test-utils';
import { resolveBookingSteps } from './booking-steps';
import { resolveStaffBookingSteps, STAFF_BOOKING_STEP_PLAN } from './staff-booking-steps';

const flat = makeHotsiteService({ id: 'flat' });
const bundle = makeHotsiteService({
  id: 'bundle',
  resourceRequirements: [choiceRequirement('STAFF'), choiceRequirement('ROOM')],
});
const legged = makeHotsiteService({
  id: 'legged',
  legs: [
    {
      legIndex: 0,
      name: 'Sauna',
      durationMinutes: 30,
      transitionGapAfterMinutes: 5,
      resourceRequirements: [choiceRequirement('ROOM')],
    },
    {
      legIndex: 1,
      name: 'Massagem',
      durationMinutes: 50,
      transitionGapAfterMinutes: 0,
      resourceRequirements: [choiceRequirement('STAFF')],
    },
  ],
});
const variable = makeHotsiteService({
  id: 'variable',
  bookingPolicy: {
    ...makeHotsiteService({ id: 'x' }).bookingPolicy,
    durationPolicy: 'CUSTOMER_SELECTED',
    durationMinMinutes: 60,
    durationMaxMinutes: 120,
    durationIncrementMinutes: 30,
  },
});

describe('resolveStaffBookingSteps', () => {
  it.each([
    ['a flat service', [flat], false],
    ['a bundle', [bundle], false],
    ['a legged service', [legged], true],
    ['a variable-duration service', [variable], false],
  ])('is the public step list minus the personal step for %s', (_name, services, hasIntake) => {
    const input = { services, hasIntake };

    expect(resolveStaffBookingSteps(input)).toEqual(
      resolveBookingSteps(input).filter((stepId) => stepId !== 'personal'),
    );
    expect(resolveStaffBookingSteps(input)).not.toContain('personal');
  });

  it('keeps one picker step per choice requirement unit and the intake step when there is a schema', () => {
    const steps = resolveStaffBookingSteps({ services: [legged], hasIntake: true });

    expect(steps[0]).toBe('services');
    expect(steps.filter((id) => id.startsWith('picker:'))).toHaveLength(2);
    expect(steps.slice(-2)).toEqual(['intake', 'confirmation']);
  });

  it('shows services, availability and confirmation until the list is resolved', () => {
    expect(STAFF_BOOKING_STEP_PLAN.initial).toEqual(['services', 'availability', 'confirmation']);
  });
});
