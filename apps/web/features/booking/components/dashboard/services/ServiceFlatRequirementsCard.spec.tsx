// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceRequirementItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ServiceFlatRequirementsCard } from './ServiceFlatRequirementsCard';

const STAFF_REQUIREMENT: ResourceRequirementItem = {
  type: 'STAFF',
  selectionMode: 'AUTO_ANY',
  resourcePoolIds: null,
  requiredQuantity: 1,
};

function renderCard(
  requirements: ResourceRequirementItem[],
  handlers: { onToggleType?: () => void } = {},
) {
  return renderWithIntl(
    <ServiceFlatRequirementsCard
      requirements={requirements}
      availableByType={() => []}
      eligibilityReady
      onToggleType={handlers.onToggleType ?? vi.fn()}
      onChangeType={vi.fn()}
    />,
  );
}

describe('ServiceFlatRequirementsCard', () => {
  it('shows the empty state when no resource type is checked — a valid resource-free service', () => {
    renderCard([]);

    expect(screen.getByTestId('resource-empty-state')).toBeInTheDocument();
  });

  it('hides the empty state once a requirement exists', () => {
    renderCard([STAFF_REQUIREMENT]);

    expect(screen.queryByTestId('resource-empty-state')).not.toBeInTheDocument();
  });

  it('reports a toggled resource type', async () => {
    const user = userEvent.setup();
    const onToggleType = vi.fn();
    const { container } = renderCard([], { onToggleType });

    await user.click(
      container.querySelector(
        '[data-testid="resource-type-checkbox"][data-scope="flat"][data-resource-type="ROOM"]',
      )!,
    );

    expect(onToggleType).toHaveBeenCalledWith('ROOM', true);
  });
});
