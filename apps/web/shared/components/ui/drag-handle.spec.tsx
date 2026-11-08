// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from '@/axe-helper';
import { DragHandle } from './drag-handle';

describe('DragHandle', () => {
  it('is a named button that shows the grip icon by default', () => {
    render(<DragHandle label="Arrastar a pergunta 1" />);

    const handle = screen.getByRole('button', { name: 'Arrastar a pergunta 1' });
    expect(handle).toHaveAttribute('type', 'button');
    expect(handle.querySelector('svg')).not.toBeNull();
    expect(handle).toHaveClass('cursor-grab', 'touch-none');
  });

  it('forwards the dnd-kit attributes and listeners, a test id and a ref to the button', async () => {
    const onPointerDown = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    const user = userEvent.setup();
    render(
      <DragHandle
        ref={ref}
        label="Arrastar"
        data-testid="grip"
        aria-describedby="hint"
        onPointerDown={onPointerDown}
      />,
    );

    await user.pointer({ keys: '[MouseLeft>]', target: screen.getByTestId('grip') });

    expect(onPointerDown).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('grip')).toHaveAttribute('aria-describedby', 'hint');
    expect(ref.current).toBe(screen.getByTestId('grip'));
  });

  it('shows a caller-given child instead of the grip icon and keeps className', () => {
    render(
      <DragHandle label="Arrastar" className="mb-2">
        ⋮⋮
      </DragHandle>,
    );

    const handle = screen.getByRole('button', { name: 'Arrastar' });
    expect(handle).toHaveTextContent('⋮⋮');
    expect(handle.querySelector('svg')).toBeNull();
    expect(handle).toHaveClass('mb-2');
  });

  it('has no axe violations', async () => {
    const { container } = render(<DragHandle label="Arrastar" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
