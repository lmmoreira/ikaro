// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { EligiblePoolPicker } from './EligiblePoolPicker';

const RENATA: ResourceResponse = {
  id: 'staff-1',
  type: 'STAFF',
  refId: null,
  name: 'Renata Souza',
  workingHours: null,
  turnoverMinutes: 0,
  maxCapacity: null,
  isActive: true,
};
const MARIA: ResourceResponse = { ...RENATA, id: 'staff-2', name: 'Maria Santos' };

function renderPicker(overrides: Partial<Parameters<typeof EligiblePoolPicker>[0]> = {}) {
  const props = {
    addEligibleId: 'add-eligible',
    eligible: [RENATA],
    addableResources: [MARIA],
    stalePool: false,
    poolIds: ['staff-1'],
    onChange: vi.fn(),
    ...overrides,
  };
  renderWithIntl(<EligiblePoolPicker {...props} />);
  return props;
}

describe('EligiblePoolPicker', () => {
  it('lists the eligible resources as chips', () => {
    renderPicker();

    expect(screen.getByTestId('resource-type-eligible-chips')).toHaveTextContent('Renata Souza');
  });

  it('adds a resource to the pool from the select', async () => {
    const user = userEvent.setup();
    const props = renderPicker();

    await user.selectOptions(screen.getByTestId('resource-type-add-eligible'), 'staff-2');

    expect(props.onChange).toHaveBeenCalledWith(['staff-1', 'staff-2']);
  });

  it('removes a resource from the pool via its chip', async () => {
    const user = userEvent.setup();
    const props = renderPicker({ eligible: [RENATA, MARIA], poolIds: ['staff-1', 'staff-2'] });

    await user.click(screen.getByRole('button', { name: /Maria Santos/ }));

    expect(props.onChange).toHaveBeenCalledWith(['staff-1']);
  });

  it('disables the select when nothing is left to add', () => {
    renderPicker({ addableResources: [] });

    expect(screen.getByTestId('resource-type-add-eligible')).toBeDisabled();
  });

  it('shows the stale-pool notice only when the pool is stale', () => {
    renderPicker({ stalePool: true, eligible: [], poolIds: ['gone'] });

    expect(screen.getByTestId('resource-type-stale-pool')).toBeInTheDocument();
  });
});
