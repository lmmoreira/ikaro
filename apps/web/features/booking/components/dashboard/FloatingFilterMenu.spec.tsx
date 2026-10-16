// @vitest-environment jsdom
import { createRef } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl, renderWithIntlInFloatingFilterDock } from '@/test-utils';
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
  };
}

describe('FloatingFilterMenu', () => {
  it('shows only the trigger while closed', () => {
    renderWithIntlInFloatingFilterDock(
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
    renderWithIntlInFloatingFilterDock(
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
    renderWithIntlInFloatingFilterDock(
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

  it('draws a hidden-count badge only when the filter hides something', () => {
    const { rerender } = renderWithIntlInFloatingFilterDock(
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

  it('throws outside a FloatingFilterDock, so a stray menu cannot float unplaced', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() =>
      renderWithIntl(
        <FloatingFilterMenu {...baseProps()}>
          <p>corpo</p>
        </FloatingFilterMenu>,
      ),
    ).toThrow('FloatingFilterMenu must be rendered inside a FloatingFilterDock');

    consoleError.mockRestore();
  });

  describe('popover orientation follows the dock corner', () => {
    it.each([
      ['top-left', ['top-full', 'left-0'], ['bottom-full', 'right-0']],
      ['top-right', ['top-full', 'right-0'], ['bottom-full', 'left-0']],
      ['bottom-left', ['bottom-full', 'left-0'], ['top-full', 'right-0']],
      ['bottom-right', ['bottom-full', 'right-0'], ['top-full', 'left-0']],
    ] as const)('%s', (corner, expected, unexpected) => {
      renderWithIntlInFloatingFilterDock(
        <FloatingFilterMenu {...baseProps()} open>
          <p>corpo</p>
        </FloatingFilterMenu>,
        { corner },
      );

      const popover = screen.getByTestId('floating-filter-popover');
      expect(popover).toHaveClass(...expected);
      for (const className of unexpected) expect(popover).not.toHaveClass(className);
    });

    it('opens exactly where it did before the pill could move when no corner was chosen', () => {
      // Negative guarantee: the default corner (bottom-right) keeps today's popover placement.
      renderWithIntlInFloatingFilterDock(
        <FloatingFilterMenu {...baseProps()} open>
          <p>corpo</p>
        </FloatingFilterMenu>,
      );

      expect(screen.getByTestId('floating-filter-popover')).toHaveClass(
        'absolute',
        'bottom-full',
        'right-0',
        'mb-3',
      );
    });
  });

  describe('popover sizing', () => {
    it.each(['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const)(
      'is capped to what is left of the screen and scrolls inside it in %s, so no corner cuts it off',
      (corner) => {
        renderWithIntlInFloatingFilterDock(
          <FloatingFilterMenu {...baseProps()} open>
            <p>corpo</p>
          </FloatingFilterMenu>,
          { corner },
        );

        const popover = screen.getByTestId('floating-filter-popover');
        expect(popover).toHaveClass('max-h-[calc(100dvh-17rem)]', 'overflow-y-auto');
        expect(popover).not.toHaveClass('overflow-hidden');
      },
    );
  });

  describe('"Posição" row', () => {
    it('offers the four corners, with the current one pressed', () => {
      renderWithIntlInFloatingFilterDock(
        <FloatingFilterMenu {...baseProps()} open>
          <p>corpo</p>
        </FloatingFilterMenu>,
        { corner: 'top-left' },
      );

      const group = screen.getByRole('group', { name: 'Posição' });
      expect(group).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Canto superior esquerdo' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      for (const name of [
        'Canto superior direito',
        'Canto inferior esquerdo',
        'Canto inferior direito',
      ]) {
        expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
      }
    });

    it.each([
      ['Canto superior esquerdo', 'top-left'],
      ['Canto superior direito', 'top-right'],
      ['Canto inferior esquerdo', 'bottom-left'],
      ['Canto inferior direito', 'bottom-right'],
    ])('reports %s as %s', async (name, expected) => {
      const user = userEvent.setup();
      const setCorner = vi.fn();
      renderWithIntlInFloatingFilterDock(
        <FloatingFilterMenu {...baseProps()} open>
          <p>corpo</p>
        </FloatingFilterMenu>,
        { corner: 'top-right', setCorner },
      );

      await user.click(screen.getByRole('button', { name }));

      expect(setCorner).toHaveBeenCalledWith(expected);
    });

    it('is a single-pointer, keyboard-reachable alternative to dragging', async () => {
      const user = userEvent.setup();
      const setCorner = vi.fn();
      renderWithIntlInFloatingFilterDock(
        <FloatingFilterMenu {...baseProps()} open>
          <p>corpo</p>
        </FloatingFilterMenu>,
        { setCorner },
      );

      screen.getByRole('button', { name: 'Canto superior esquerdo' }).focus();
      await user.keyboard('{Enter}');

      expect(setCorner).toHaveBeenCalledWith('top-left');
    });

    it('does not move the pill when "Padrão" resets the filter choices', async () => {
      const user = userEvent.setup();
      const setCorner = vi.fn();
      const props = { ...baseProps(), open: true };
      renderWithIntlInFloatingFilterDock(
        <FloatingFilterMenu {...props}>
          <p>corpo</p>
        </FloatingFilterMenu>,
        { corner: 'top-left', setCorner },
      );

      await user.click(screen.getByRole('button', { name: 'Padrão' }));

      expect(props.onReset).toHaveBeenCalledTimes(1);
      expect(setCorner).not.toHaveBeenCalled();
    });
  });

  describe('dragging', () => {
    it('lets only the pill opt out of scrolling, so the page still scrolls everywhere else', () => {
      const props = { ...baseProps(), open: true };
      renderWithIntlInFloatingFilterDock(
        <FloatingFilterMenu {...props}>
          <p>corpo</p>
        </FloatingFilterMenu>,
      );

      expect(screen.getByRole('button', { name: 'Filtrar' })).toHaveClass('touch-none');
      expect(props.containerRef.current).not.toHaveClass('touch-none');
      expect(screen.getByTestId('floating-filter-popover')).not.toHaveClass('touch-none');
    });

    it('closes an open popover as soon as a drag starts', () => {
      const props = { ...baseProps(), open: true };
      renderWithIntlInFloatingFilterDock(
        <FloatingFilterMenu {...props}>
          <p>corpo</p>
        </FloatingFilterMenu>,
        { isDragging: true },
      );

      expect(props.onClose).toHaveBeenCalled();
    });

    it('leaves a closed popover alone while dragging, and an open one alone when not dragging', () => {
      const closed = baseProps();
      renderWithIntlInFloatingFilterDock(
        <FloatingFilterMenu {...closed}>
          <p>corpo</p>
        </FloatingFilterMenu>,
        { isDragging: true },
      );
      expect(closed.onClose).not.toHaveBeenCalled();

      const open = { ...baseProps(), open: true };
      renderWithIntlInFloatingFilterDock(
        <FloatingFilterMenu {...open}>
          <p>corpo</p>
        </FloatingFilterMenu>,
      );
      expect(open.onClose).not.toHaveBeenCalled();
    });
  });
});
