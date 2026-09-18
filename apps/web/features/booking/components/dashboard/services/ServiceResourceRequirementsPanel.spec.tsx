// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ServiceResourceRequirementsPanel } from './ServiceResourceRequirementsPanel';

const resourceRequirementsMutateAsync = vi.fn().mockResolvedValue({});
const legsMutateAsync = vi.fn().mockResolvedValue({});
const updateServiceMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('@/features/booking/hooks/useResources', () => ({
  useResources: () => ({ data: { items: [] } }),
}));

vi.mock('@/features/booking/services/useServices', () => ({
  useUpdateServiceResourceRequirements: () => ({
    mutateAsync: resourceRequirementsMutateAsync,
    isPending: false,
  }),
  useUpdateServiceLegs: () => ({ mutateAsync: legsMutateAsync, isPending: false }),
  useUpdateService: () => ({ mutateAsync: updateServiceMutateAsync, isPending: false }),
}));

beforeEach(() => {
  resourceRequirementsMutateAsync.mockClear();
  legsMutateAsync.mockClear();
  updateServiceMutateAsync.mockClear();
});

// data-testid stays static across all 3 resource-type rows (E2E-3) — disambiguated by the
// sibling data-resource-type attribute instead.
function getResourceTypeCheckbox(container: HTMLElement, type: string): HTMLElement {
  const el = container.querySelector(
    `[data-testid="resource-type-checkbox"][data-resource-type="${type}"]`,
  );
  if (!el) throw new Error(`No resource-type checkbox found for type=${type}`);
  return el as HTMLElement;
}

describe('ServiceResourceRequirementsPanel', () => {
  it('shows the empty state when no resource types are checked', () => {
    renderWithIntl(
      <ServiceResourceRequirementsPanel
        serviceId="svc-1"
        initialResourceRequirements={[]}
        initialLegs={null}
        initialBufferAfterMinutes={10}
        onDirtyChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('resource-empty-state')).toBeInTheDocument();
  });

  it('checking a resource type marks the tab dirty and clears the empty state', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    const { container } = renderWithIntl(
      <ServiceResourceRequirementsPanel
        serviceId="svc-1"
        initialResourceRequirements={[]}
        initialLegs={null}
        initialBufferAfterMinutes={10}
        onDirtyChange={onDirtyChange}
      />,
    );

    await user.click(getResourceTypeCheckbox(container, 'STAFF'));
    expect(onDirtyChange).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId('resource-empty-state')).not.toBeInTheDocument();
  });

  it('switching to legs mode hides the flat checklist and shows the legs panel', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <ServiceResourceRequirementsPanel
        serviceId="svc-1"
        initialResourceRequirements={[]}
        initialLegs={null}
        initialBufferAfterMinutes={null}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('resource-mode-legs'));
    expect(screen.getByTestId('legs-add-button')).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="resource-type-checkbox"]'),
    ).not.toBeInTheDocument();
  });

  it('saving in flat mode calls updateServiceResourceRequirements and updateService for the buffer', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    renderWithIntl(
      <ServiceResourceRequirementsPanel
        serviceId="svc-1"
        initialResourceRequirements={[
          { type: 'STAFF', selectionMode: 'AUTO_ANY', resourcePoolIds: null, requiredQuantity: 1 },
        ]}
        initialLegs={null}
        initialBufferAfterMinutes={10}
        onDirtyChange={onDirtyChange}
      />,
    );

    await user.click(screen.getByTestId('resource-requirements-save'));

    expect(resourceRequirementsMutateAsync).toHaveBeenCalledWith({
      id: 'svc-1',
      body: {
        resourceRequirements: [
          { type: 'STAFF', selectionMode: 'AUTO_ANY', resourcePoolIds: null, requiredQuantity: 1 },
        ],
      },
    });
    expect(updateServiceMutateAsync).toHaveBeenCalledWith({
      id: 'svc-1',
      body: { bufferAfterMinutes: 10 },
    });
    expect(screen.getByTestId('resource-requirements-saved')).toBeInTheDocument();
    expect(onDirtyChange).toHaveBeenCalledWith(false);
  });

  it('saving in legs mode calls updateServiceLegs, not updateServiceResourceRequirements', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ServiceResourceRequirementsPanel
        serviceId="svc-1"
        initialResourceRequirements={[]}
        initialLegs={[
          {
            legIndex: 0,
            name: 'Sauna',
            durationMinutes: 20,
            resourceRequirements: [],
            transitionGapAfterMinutes: 0,
          },
        ]}
        initialBufferAfterMinutes={null}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('resource-requirements-save'));

    expect(legsMutateAsync).toHaveBeenCalled();
    expect(resourceRequirementsMutateAsync).not.toHaveBeenCalled();
  });
});
