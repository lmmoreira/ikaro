// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  HotsiteServiceLeg,
  HotsiteServiceResourceOptionsRequirement,
  ResourceSelectionItem,
} from '@ikaro/types';
import {
  choiceRequirement,
  hotsiteServiceBookingDefaults,
  makeHotsiteService,
  renderWithIntl,
} from '@/test-utils';
import { pickerUnitKey, type PickerUnit } from '@/features/booking/model/booking-steps';
import { ResourcePickerStep } from './ResourcePickerStep';

const SERVICE_ID = '00000000-0000-0000-0000-0000000000b1';

function requirement(
  resourceType: HotsiteServiceResourceOptionsRequirement['resourceType'],
  legIndex: number | null,
): HotsiteServiceResourceOptionsRequirement {
  return {
    serviceId: SERVICE_ID,
    legIndex,
    resourceType,
    selectionMode: 'CUSTOMER_CHOICE',
    requiredQuantity: 1,
    options: [{ resourceId: `${resourceType}-${legIndex ?? 'f'}`, name: `Opção ${resourceType}` }],
  };
}

const flatUnit: PickerUnit = {
  key: pickerUnitKey(SERVICE_ID, null),
  serviceId: SERVICE_ID,
  legIndex: null,
  legName: null,
};
const legUnit: PickerUnit = {
  key: pickerUnitKey(SERVICE_ID, 1),
  serviceId: SERVICE_ID,
  legIndex: 1,
  legName: 'Massagem',
};

const legs: HotsiteServiceLeg[] = [0, 1, 2].map((legIndex) => ({
  legIndex,
  name: `Etapa ${legIndex}`,
  durationMinutes: 20,
  transitionGapAfterMinutes: 0,
  resourceRequirements: [choiceRequirement('STAFF')],
}));

function renderStep(
  unit: PickerUnit,
  requirements: HotsiteServiceResourceOptionsRequirement[],
  picks: ResourceSelectionItem[] = [],
) {
  const props = {
    onPick: vi.fn(),
    onRetry: vi.fn(),
    onBack: vi.fn(),
    onNext: vi.fn(),
  };
  renderWithIntl(
    <ResourcePickerStep
      unit={unit}
      service={makeHotsiteService({ id: SERVICE_ID, name: 'Jornada Spa', legs })}
      requirements={requirements}
      picks={picks}
      status="ready"
      reselectMessage={null}
      {...props}
    />,
  );
  return props;
}

describe('ResourcePickerStep', () => {
  it('headed by the resource type for a single-section flat unit, with the service line', () => {
    renderStep(flatUnit, [requirement('STAFF', null)]);

    expect(screen.getByRole('heading', { name: 'Escolha o profissional' })).toBeInTheDocument();
    expect(screen.getByText(/Jornada Spa — R\$ 150,00 — 1h/)).toBeInTheDocument();
  });

  it('headed "Faça suas escolhas" for a multi-section flat unit', () => {
    renderStep(flatUnit, [requirement('STAFF', null), requirement('ROOM', null)]);

    expect(screen.getByRole('heading', { name: 'Faça suas escolhas' })).toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(2);
  });

  it('headed by the leg name with the journey subtitle for a leg unit, showing only its own sections', () => {
    renderStep(legUnit, [requirement('STAFF', 1), requirement('ROOM', 1), requirement('STAFF', 2)]);

    expect(screen.getByRole('heading', { name: 'Massagem' })).toBeInTheDocument();
    expect(screen.getByText('Jornada Spa · Etapa 2 de 3 da jornada')).toBeInTheDocument();
    expect(screen.getAllByRole('group')).toHaveLength(2);
  });

  it('keeps Próximo disabled until every section has a pick', () => {
    renderStep(
      flatUnit,
      [requirement('STAFF', null), requirement('ROOM', null)],
      [{ serviceId: SERVICE_ID, legIndex: null, resourceType: 'STAFF', resourceId: 'STAFF-f' }],
    );

    expect(screen.getByTestId('step-next')).toBeDisabled();
  });

  it('enables Próximo and continues once everything is picked', async () => {
    const user = userEvent.setup();
    const { onNext } = renderStep(
      flatUnit,
      [requirement('STAFF', null)],
      [{ serviceId: SERVICE_ID, legIndex: null, resourceType: 'STAFF', resourceId: 'STAFF-f' }],
    );

    await user.click(screen.getByTestId('step-next'));

    expect(onNext).toHaveBeenCalled();
  });

  it('goes back', async () => {
    const user = userEvent.setup();
    const { onBack } = renderStep(flatUnit, [requirement('STAFF', null)]);

    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    expect(onBack).toHaveBeenCalled();
  });

  it('keeps Próximo disabled for a unit with no requirement at all', () => {
    renderStep(flatUnit, []);

    expect(screen.getByTestId('step-next')).toBeDisabled();
  });

  it('summarises a per-time service as "a partir de" instead of a fixed price', () => {
    const perTime = makeHotsiteService({
      id: SERVICE_ID,
      name: 'Sala',
      bookingPolicy: {
        ...hotsiteServiceBookingDefaults.bookingPolicy,
        durationPolicy: 'CUSTOMER_SELECTED',
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 60,
        pricePerIncrementAmount: 50,
      },
    });
    renderWithIntl(
      <ResourcePickerStep
        unit={flatUnit}
        service={perTime}
        requirements={[requirement('ROOM', null)]}
        picks={[]}
        status="ready"
        reselectMessage={null}
        onPick={vi.fn()}
        onRetry={vi.fn()}
        onBack={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(
      screen.getByText('Sala — a partir de R$ 50,00 — duração a escolher'),
    ).toBeInTheDocument();
  });
});
