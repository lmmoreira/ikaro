// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { choiceRequirement, makeHotsiteService } from '@/test-utils';
import { useBookingFlow } from './useBookingFlow';

const plain = makeHotsiteService({ id: 'plain' });
const staff = makeHotsiteService({
  id: 'staff',
  resourceRequirements: [choiceRequirement('STAFF')],
});

function setup(initial: Parameters<typeof useBookingFlow>[0]) {
  return renderHook((props: Parameters<typeof useBookingFlow>[0]) => useBookingFlow(props), {
    initialProps: initial,
  });
}

describe('useBookingFlow', () => {
  it('starts on the services step with the default four-step list until resolved', () => {
    const { result } = setup({ selectedServices: [staff], resolved: false, hasIntake: false });

    expect(result.current.stepId).toBe('services');
    expect(result.current.steps).toEqual(['services', 'availability', 'personal', 'confirmation']);
    expect(result.current.total).toBe(4);
    expect(result.current.position).toBe(1);
  });

  it('derives the total from the selected services and intake once resolved', () => {
    const { result } = setup({ selectedServices: [staff], resolved: true, hasIntake: true });

    expect(result.current.total).toBe(6);
    expect(result.current.steps[1]).toBe('picker:staff:-');
  });

  it('moves forward and back through the list', () => {
    const { result } = setup({ selectedServices: [plain], resolved: true, hasIntake: false });

    act(() => result.current.goNext());
    expect(result.current.stepId).toBe('availability');
    expect(result.current.position).toBe(2);

    act(() => result.current.goBack());
    expect(result.current.stepId).toBe('services');
  });

  it('does not move past either end of the list', () => {
    const { result } = setup({ selectedServices: [plain], resolved: true, hasIntake: false });

    act(() => result.current.goBack());
    expect(result.current.stepId).toBe('services');

    act(() => result.current.goTo('confirmation'));
    act(() => result.current.goNext());
    expect(result.current.stepId).toBe('confirmation');
  });

  it('jumps to a given step', () => {
    const { result } = setup({ selectedServices: [plain], resolved: true, hasIntake: false });

    act(() => result.current.goTo('personal'));

    expect(result.current.stepId).toBe('personal');
    expect(result.current.position).toBe(3);
  });

  it('keeps a per-step error map that can be set, replaced and cleared', () => {
    const { result } = setup({ selectedServices: [plain], resolved: false, hasIntake: false });

    act(() => result.current.setError('availability', { message: 'conflito', code: 'X' }));
    act(() => result.current.setError('intake', { message: 'faltou' }));
    expect(result.current.errors.availability).toEqual({ message: 'conflito', code: 'X' });

    act(() => result.current.setError('availability', null));
    expect(result.current.errors.availability).toBeUndefined();
    expect(result.current.errors.intake).toEqual({ message: 'faltou' });

    act(() => result.current.clearErrors());
    expect(result.current.errors).toEqual({});
  });
});
