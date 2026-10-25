// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ContentBlockProcessStepsData, ContentBlockTrustGridData } from '@ikaro/types';
import { getPillOption, renderWithIntl } from '@/test-utils';
import { ProcessStepsFields, TrustGridFields } from './ContentBlockListVariants';

const GRID: ContentBlockTrustGridData = {
  variant: 'trust-grid',
  title: 'T',
  items: [{ label: 'A' }, { label: 'B', description: 'desc' }],
};
const STEPS: ContentBlockProcessStepsData = {
  variant: 'process-steps',
  title: 'T',
  items: [
    { title: 'Um', body: 'corpo 1' },
    { title: 'Dois', body: 'corpo 2', label: '02' },
  ],
};

describe('TrustGridFields', () => {
  it('picks the appearance', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<TrustGridFields data={GRID} onChange={onChange} />);

    await user.click(getPillOption('content-block-appearance', 'tiles'));

    expect(onChange).toHaveBeenLastCalledWith({ ...GRID, appearance: 'tiles' });
  });

  it('defaults the appearance to the ruled list', () => {
    renderWithIntl(<TrustGridFields data={GRID} onChange={vi.fn()} />);

    expect(getPillOption('content-block-appearance', 'rule')).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('adds a blank point', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<TrustGridFields data={GRID} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Adicionar ponto' }));

    expect(onChange).toHaveBeenLastCalledWith({ ...GRID, items: [...GRID.items, { label: '' }] });
  });

  // Negative guarantee: the schema needs at least two points.
  it('cannot go below two points', () => {
    renderWithIntl(<TrustGridFields data={GRID} onChange={vi.fn()} />);

    for (const remove of screen.getAllByTestId('content-block-item-remove')) {
      expect(remove).toBeDisabled();
    }
  });

  it('clears a description to a missing key but keeps the empty required label', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<TrustGridFields data={GRID} onChange={onChange} />);

    await user.clear(screen.getByLabelText('Descrição do ponto 2 (opcional)'));

    expect(onChange).toHaveBeenLastCalledWith({
      ...GRID,
      items: [{ label: 'A' }, { label: 'B' }],
    });
  });
});

describe('ProcessStepsFields', () => {
  it('picks the appearance', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<ProcessStepsFields data={STEPS} onChange={onChange} />);

    await user.click(getPillOption('content-block-appearance', 'ruled'));

    expect(onChange).toHaveBeenLastCalledWith({ ...STEPS, appearance: 'ruled' });
  });

  it('edits a step’s marker and removes the key when emptied', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<ProcessStepsFields data={STEPS} onChange={onChange} />);

    await user.clear(screen.getByLabelText('Marcador da etapa 2 (opcional)'));

    expect(onChange).toHaveBeenLastCalledWith({
      ...STEPS,
      items: [STEPS.items[0], { title: 'Dois', body: 'corpo 2' }],
    });
  });

  it('adds a blank step and bounds the step fields', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<ProcessStepsFields data={STEPS} onChange={onChange} />);

    expect(screen.getByLabelText('Título da etapa 1')).toHaveAttribute('maxlength', '60');
    expect(screen.getByLabelText('Texto da etapa 1')).toHaveAttribute('maxlength', '240');
    await user.click(screen.getByRole('button', { name: 'Adicionar etapa' }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...STEPS,
      items: [...STEPS.items, { title: '', body: '' }],
    });
  });
});
