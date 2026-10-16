// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FloatingFilterMenu } from './FloatingFilterMenu';

function baseProps() {
  return {
    containerRef: createRef<HTMLDivElement>(),
    open: false,
    onToggleOpen: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
    triggerLabel: 'Filtrar',
    title: 'Título do filtro',
    description: 'Descrição do filtro',
    resetLabel: 'Padrão',
    doneLabel: 'Concluído',
    positionClassName: 'bottom-24 right-4',
  };
}

describe('FloatingFilterMenu', () => {
  it('shows only the trigger while closed', () => {
    render(
      <FloatingFilterMenu {...baseProps()}>
        <p>corpo</p>
      </FloatingFilterMenu>,
    );

    expect(screen.getByRole('button', { name: 'Filtrar' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText('Título do filtro')).not.toBeInTheDocument();
    expect(screen.queryByText('corpo')).not.toBeInTheDocument();
  });

  it('renders the title, description, body and footer when open', () => {
    render(
      <FloatingFilterMenu {...baseProps()} open>
        <p>corpo</p>
      </FloatingFilterMenu>,
    );

    expect(screen.getByText('Título do filtro')).toBeInTheDocument();
    expect(screen.getByText('Descrição do filtro')).toBeInTheDocument();
    expect(screen.getByText('corpo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Filtrar' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('calls onToggleOpen, onReset and onClose from the trigger and the footer', async () => {
    const user = userEvent.setup();
    const props = { ...baseProps(), open: true };
    render(
      <FloatingFilterMenu {...props}>
        <p>corpo</p>
      </FloatingFilterMenu>,
    );

    await user.click(screen.getByRole('button', { name: 'Filtrar' }));
    await user.click(screen.getByRole('button', { name: 'Padrão' }));
    await user.click(screen.getByRole('button', { name: 'Concluído' }));

    expect(props.onToggleOpen).toHaveBeenCalledTimes(1);
    expect(props.onReset).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('applies the caller position so stacked menus do not overlap', () => {
    const props = baseProps();
    render(
      <FloatingFilterMenu {...props} positionClassName="bottom-44 right-4">
        <p>corpo</p>
      </FloatingFilterMenu>,
    );

    expect(props.containerRef.current).toHaveClass('fixed', 'bottom-44', 'right-4');
  });

  it('draws a hidden-count badge only when the filter hides something', () => {
    const { rerender } = render(
      <FloatingFilterMenu {...baseProps()} hiddenCount={0} hiddenCountLabel="2 ocultos">
        <p>corpo</p>
      </FloatingFilterMenu>,
    );
    expect(screen.queryByTestId('floating-filter-hidden-count')).not.toBeInTheDocument();

    rerender(
      <FloatingFilterMenu {...baseProps()} hiddenCount={2} hiddenCountLabel="2 ocultos">
        <p>corpo</p>
      </FloatingFilterMenu>,
    );
    expect(screen.getByTestId('floating-filter-hidden-count')).toHaveTextContent('2');
    expect(screen.getByLabelText('2 ocultos')).toBeInTheDocument();
  });
});
