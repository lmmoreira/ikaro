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

    // sum(durations) + gaps between legs = (20 + 50) + 10 = 80
    expect(screen.getByTestId('legs-total-span')).toHaveTextContent('80');
  });

  it("does not count the last leg's transition gap in the total span", () => {
    const withTrailingGap = LEGS.map((leg, index) =>
      index === LEGS.length - 1 ? { ...leg, transitionGapAfterMinutes: 25 } : leg,
    );

    renderWithIntl(
      <ServiceLegsPanel
        legs={withTrailingGap}
        availableResourcesByType={() => []}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('legs-total-span')).toHaveTextContent('80');
  });

  it('shows the too-few-legs hint when exactly 1 leg remains', () => {
    renderWithIntl(
      <ServiceLegsPanel legs={[LEGS[0]!]} availableResourcesByType={() => []} onChange={vi.fn()} />,
    );

    const message = screen.getByTestId('legs-min-required-error');
    expect(message).toBeInTheDocument();
    // Field message pattern (TD57): no role; the add-leg button, which fixes it, points at it.
    expect(message).not.toHaveAttribute('role');
    expect(screen.getByTestId('legs-add-button')).toHaveAttribute('aria-describedby', message.id);
  });

  it('shows no too-few-legs hint and no description link with two legs', () => {
    renderWithIntl(
      <ServiceLegsPanel legs={LEGS} availableResourcesByType={() => []} onChange={vi.fn()} />,
    );

    expect(screen.queryByTestId('legs-min-required-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('legs-add-button')).not.toHaveAttribute('aria-describedby');
  });

  it('shows no too-few-legs hint when there are no legs yet', () => {
    renderWithIntl(
      <ServiceLegsPanel legs={[]} availableResourcesByType={() => []} onChange={vi.fn()} />,
    );

    expect(screen.queryByTestId('legs-min-required-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('legs-add-button')).not.toHaveAttribute('aria-describedby');
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

describe('ServiceLegsPanel units (TD51-S3)', () => {
  it('shows minutes on every leg duration and transition field', () => {
    renderWithIntl(
      <ServiceLegsPanel legs={LEGS} availableResourcesByType={() => []} onChange={vi.fn()} />,
    );

    for (const input of screen.getAllByTestId('leg-duration')) {
      expect(input.parentElement).toHaveTextContent('min');
    }
    for (const input of screen.getAllByTestId('leg-transition-gap')) {
      expect(input.parentElement).toHaveTextContent('min');
    }
    expect(screen.getAllByTestId('leg-duration')).toHaveLength(2);
  });
});
