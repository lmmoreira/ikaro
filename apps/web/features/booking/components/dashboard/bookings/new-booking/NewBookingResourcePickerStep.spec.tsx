// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteServiceResourceOptionsRequirement } from '@ikaro/types';
import { choiceRequirement, makeHotsiteService, renderWithIntl } from '@/test-utils';
import { pickerUnitKey, type PickerUnit } from '@/features/booking/model/booking-steps';
import { NewBookingResourcePickerStep } from './NewBookingResourcePickerStep';

const SERVICE = makeHotsiteService({
  id: 'svc',
  name: 'Corte',
  resourceRequirements: [choiceRequirement('STAFF')],
});
const UNIT: PickerUnit = {
  key: pickerUnitKey('svc', null),
  serviceId: 'svc',
  legIndex: null,
  legName: null,
};
const STAFF_REQ: HotsiteServiceResourceOptionsRequirement = {
  serviceId: 'svc',
  legIndex: null,
  resourceType: 'STAFF',
  selectionMode: 'CUSTOMER_CHOICE',
  requiredQuantity: 1,
  options: [
    { resourceId: 'r-1', name: 'Ana Souza' },
    { resourceId: 'r-2', name: 'Bruno Lima' },
  ],
};
const ROOM_REQ: HotsiteServiceResourceOptionsRequirement = {
  ...STAFF_REQ,
  resourceType: 'ROOM',
  options: [{ resourceId: 'room-1', name: 'Sala 1' }],
};

function renderStep(
  overrides: Partial<React.ComponentProps<typeof NewBookingResourcePickerStep>> = {},
) {
  const props = {
    unit: UNIT,
    service: SERVICE,
    requirements: [STAFF_REQ],
    picks: [],
    status: 'ready' as const,
    reselectMessage: null,
    onPick: vi.fn(),
    onRetry: vi.fn(),
    summary: null,
    onBack: vi.fn(),
    onNext: vi.fn(),
    ...overrides,
  };
  renderWithIntl(<NewBookingResourcePickerStep {...props} />);
  return props;
}

describe('NewBookingResourcePickerStep', () => {
  it('offers each resource of the requirement and reports the pick', async () => {
    const props = renderStep();

    expect(screen.getAllByTestId('picker-option')).toHaveLength(2);
    await userEvent.click(screen.getAllByTestId('picker-option')[1]!);

    expect(props.onPick).toHaveBeenCalledWith(STAFF_REQ, 'r-2');
  });

  it('pre-selects nothing and cannot continue until every requirement is picked', () => {
    renderStep();

    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();
    expect(screen.getByTestId('picker-hint')).toBeInTheDocument();
  });

  it('continues once the pick is made', async () => {
    const props = renderStep({
      picks: [{ serviceId: 'svc', resourceType: 'STAFF', resourceId: 'r-1' }],
    });

    await userEvent.click(screen.getAllByTestId('step-next')[0]!);

    expect(props.onNext).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('picker-hint')).not.toBeInTheDocument();
  });

  it('shows one section per requirement of a bundle and needs both picks', () => {
    renderStep({ requirements: [STAFF_REQ, ROOM_REQ] });

    expect(screen.getAllByTestId('picker-section')).toHaveLength(2);
    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();
  });

  it('heads a legged service’s step with the leg name and its position', () => {
    const legged = makeHotsiteService({
      id: 'svc',
      name: 'Dia de spa',
      legs: [
        {
          legIndex: 0,
          name: 'Sauna',
          durationMinutes: 30,
          transitionGapAfterMinutes: 0,
          resourceRequirements: [],
        },
        {
          legIndex: 1,
          name: 'Massagem',
          durationMinutes: 50,
          transitionGapAfterMinutes: 0,
          resourceRequirements: [],
        },
      ],
    });
    renderStep({
      service: legged,
      unit: { key: pickerUnitKey('svc', 1), serviceId: 'svc', legIndex: 1, legName: 'Massagem' },
      requirements: [{ ...STAFF_REQ, legIndex: 1 }],
    });

    expect(screen.getByTestId('picker-heading')).toHaveTextContent('Massagem');
    expect(screen.getByText(/Dia de spa/)).toBeInTheDocument();
  });

  it('keeps continuing blocked while the options are loading or failed, and retries', async () => {
    const props = renderStep({ status: 'error' });

    expect(screen.getAllByTestId('step-next')[0]).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(props.onRetry).toHaveBeenCalledOnce();
  });

  it('tells staff to pick again when the earlier pick is no longer offered', () => {
    renderStep({ reselectMessage: 'Esse profissional não está mais disponível' });

    expect(screen.getByTestId('picker-reselect-error')).toHaveTextContent(
      'Esse profissional não está mais disponível',
    );
  });
});
