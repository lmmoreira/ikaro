// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceLegItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ServiceLegsPanel } from './ServiceLegsPanel';

const LEGS: ServiceLegItem[] = [
  {
    legIndex: 0,
    name: 'Sauna',
    durationMinutes: 20,
    resourceRequirements: [
      { type: 'ROOM', selectionMode: 'AUTO_ANY', resourcePoolIds: null, requiredQuantity: 1 },
    ],
    transitionGapAfterMinutes: 10,
  },
  {
    legIndex: 1,
    name: 'Massagem',
    durationMinutes: 50,
    resourceRequirements: [],
    transitionGapAfterMinutes: 0,
  },
];

// data-testid stays static across repeated leg rows/fields (E2E-3) — disambiguated by the
// sibling data-leg-index (or data-scope/data-resource-type) attribute instead.
function getByLegIndex(container: HTMLElement, testId: string, legIndex: number): HTMLElement {
  const el = container.querySelector(`[data-testid="${testId}"][data-leg-index="${legIndex}"]`);
  if (!el) throw new Error(`No element found for testId=${testId} legIndex=${legIndex}`);
  return el as HTMLElement;
}

function getLegResourceTypeCheckbox(
  container: HTMLElement,
  legIndex: number,
  type: string,
): HTMLElement {
  const el = container.querySelector(
    `[data-testid="resource-type-checkbox"][data-scope="leg-${legIndex}"][data-resource-type="${type}"]`,
  );
  if (!el) throw new Error(`No checkbox found for leg=${legIndex} type=${type}`);
  return el as HTMLElement;
}

describe('ServiceLegsPanel', () => {
  it('computes and displays the total span matching the backend formula', () => {
    renderWithIntl(
      <ServiceLegsPanel legs={LEGS} availableResourcesByType={() => []} onChange={vi.fn()} />,
    );

    // sum(durations) + sum(transition gaps) = (20 + 50) + (10 + 0) = 80
    expect(screen.getByTestId('legs-total-span')).toHaveTextContent('80');
  });

  it('shows the too-few-legs hint when exactly 1 leg remains', () => {
    renderWithIntl(
      <ServiceLegsPanel legs={[LEGS[0]!]} availableResourcesByType={() => []} onChange={vi.fn()} />,
    );

    expect(screen.getByTestId('legs-min-required-error')).toBeInTheDocument();
  });

  it('adds a new leg via the add-stage button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <ServiceLegsPanel legs={LEGS} availableResourcesByType={() => []} onChange={onChange} />,
    );

    await user.click(screen.getByTestId('legs-add-button'));
    expect(onChange).toHaveBeenCalledWith([
      ...LEGS,
      expect.objectContaining({ legIndex: 2, name: '' }),
    ]);
  });

  it('removes a leg and renumbers the rest', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <ServiceLegsPanel legs={LEGS} availableResourcesByType={() => []} onChange={onChange} />,
    );

    await user.click(getByLegIndex(container, 'leg-remove', 0));
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ legIndex: 0, name: 'Massagem' }),
    ]);
  });

  it('toggles a resource type for a specific leg', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <ServiceLegsPanel legs={LEGS} availableResourcesByType={() => []} onChange={onChange} />,
    );

    await user.click(getLegResourceTypeCheckbox(container, 1, 'STAFF'));
    expect(onChange).toHaveBeenCalledWith([
      LEGS[0],
      expect.objectContaining({
        legIndex: 1,
        resourceRequirements: [
          { type: 'STAFF', selectionMode: 'AUTO_ANY', resourcePoolIds: null, requiredQuantity: 1 },
        ],
      }),
    ]);
  });

  it('updates a leg name field', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = renderWithIntl(
      <ServiceLegsPanel legs={LEGS} availableResourcesByType={() => []} onChange={onChange} />,
    );

    const nameInput = getByLegIndex(container, 'leg-name', 0);
    await user.clear(nameInput);
    await user.type(nameInput, 'X');
    expect(onChange).toHaveBeenCalled();
  });
});
