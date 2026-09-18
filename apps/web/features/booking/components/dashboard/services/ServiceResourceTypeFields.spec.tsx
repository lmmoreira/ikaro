// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceRequirementItem, ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ServiceResourceTypeFields } from './ServiceResourceTypeFields';

const STAFF_A: ResourceResponse = {
  id: 'staff-1',
  type: 'STAFF',
  refId: null,
  name: 'Renata Souza',
  workingHours: null,
  turnoverMinutes: 0,
  maxCapacity: null,
  isActive: true,
};
const STAFF_B: ResourceResponse = { ...STAFF_A, id: 'staff-2', name: 'Maria Santos' };

describe('ServiceResourceTypeFields', () => {
  it('renders unchecked with no detail fields when not included', () => {
    renderWithIntl(
      <ServiceResourceTypeFields
        type="STAFF"
        checked={false}
        requirement={null}
        availableResources={[STAFF_A, STAFF_B]}
        radioGroupName="selmode-staff"
        scope="flat"
        onToggle={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('resource-type-checkbox')).not.toBeChecked();
    expect(screen.queryByTestId('resource-type-quantity')).not.toBeInTheDocument();
  });

  it('calls onToggle when the checkbox is toggled', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithIntl(
      <ServiceResourceTypeFields
        type="STAFF"
        checked={false}
        requirement={null}
        availableResources={[STAFF_A]}
        radioGroupName="selmode-staff"
        scope="flat"
        onToggle={onToggle}
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('resource-type-checkbox'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('shows detail fields and eligible chips when checked', () => {
    const requirement: ResourceRequirementItem = {
      type: 'STAFF',
      selectionMode: 'CUSTOMER_CHOICE',
      resourcePoolIds: ['staff-1'],
      requiredQuantity: 1,
    };
    renderWithIntl(
      <ServiceResourceTypeFields
        type="STAFF"
        checked
        requirement={requirement}
        availableResources={[STAFF_A, STAFF_B]}
        radioGroupName="selmode-staff"
        scope="flat"
        onToggle={vi.fn()}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('resource-type-quantity')).toHaveValue(1);
    const chips = screen.getByTestId('resource-type-eligible-chips');
    expect(within(chips).getByText('Renata Souza')).toBeInTheDocument();
    expect(within(chips).queryByText('Maria Santos')).not.toBeInTheDocument();
  });

  it('adds a resource to the eligible pool via the add-select', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const requirement: ResourceRequirementItem = {
      type: 'STAFF',
      selectionMode: 'AUTO_ANY',
      resourcePoolIds: ['staff-1'],
      requiredQuantity: 1,
    };
    renderWithIntl(
      <ServiceResourceTypeFields
        type="STAFF"
        checked
        requirement={requirement}
        availableResources={[STAFF_A, STAFF_B]}
        radioGroupName="selmode-staff"
        scope="flat"
        onToggle={vi.fn()}
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByTestId('resource-type-add-eligible'), 'staff-2');
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ resourcePoolIds: ['staff-1', 'staff-2'] }),
    );
  });

  it('removes a resource from the eligible pool via the chip remove button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const requirement: ResourceRequirementItem = {
      type: 'STAFF',
      selectionMode: 'CUSTOMER_CHOICE',
      resourcePoolIds: ['staff-1', 'staff-2'],
      requiredQuantity: 1,
    };
    renderWithIntl(
      <ServiceResourceTypeFields
        type="STAFF"
        checked
        requirement={requirement}
        availableResources={[STAFF_A, STAFF_B]}
        radioGroupName="selmode-staff"
        scope="flat"
        onToggle={vi.fn()}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByLabelText('Remover Renata Souza'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ resourcePoolIds: ['staff-2'] }),
    );
  });

  it('derives AUTO_FUNGIBLE_POOL from requiredQuantity > 1 when auto-assign is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const requirement: ResourceRequirementItem = {
      type: 'ROOM',
      selectionMode: 'AUTO_ANY',
      resourcePoolIds: null,
      requiredQuantity: 1,
    };
    renderWithIntl(
      <ServiceResourceTypeFields
        type="ROOM"
        checked
        requirement={requirement}
        availableResources={[]}
        radioGroupName="selmode-room"
        scope="flat"
        onToggle={vi.fn()}
        onChange={onChange}
      />,
    );

    const quantityInput = screen.getByTestId('resource-type-quantity');
    await user.tripleClick(quantityInput);
    await user.keyboard('3');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ requiredQuantity: 3, selectionMode: 'AUTO_FUNGIBLE_POOL' }),
    );
  });

  it('sets CUSTOMER_CHOICE when that radio is picked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const requirement: ResourceRequirementItem = {
      type: 'ROOM',
      selectionMode: 'AUTO_ANY',
      resourcePoolIds: null,
      requiredQuantity: 1,
    };
    renderWithIntl(
      <ServiceResourceTypeFields
        type="ROOM"
        checked
        requirement={requirement}
        availableResources={[]}
        radioGroupName="selmode-room"
        scope="flat"
        onToggle={vi.fn()}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByText('Cliente escolhe entre os elegíveis'));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ selectionMode: 'CUSTOMER_CHOICE' }),
    );
  });
});
