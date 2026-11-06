// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog';

function renderControlled(onOpenChange = vi.fn()) {
  render(
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent overlayTestId="overlay">
        <DialogHeader>
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Descrição</DialogDescription>
        </DialogHeader>
        <input aria-label="Motivo" />
        <DialogFooter>
          <DialogClose>Cancelar</DialogClose>
          <button type="button">Confirmar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  );
  return { onOpenChange };
}

describe('Dialog', () => {
  it('renders an accessible modal dialog labelled by its title and description', () => {
    renderControlled();

    const dialog = screen.getByRole('dialog', { name: 'Título' });
    expect(dialog).toHaveAccessibleDescription('Descrição');
  });

  it('renders nothing when closed', () => {
    render(
      <Dialog open={false}>
        <DialogContent>
          <DialogTitle>Título</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is exposed as a modal dialog (aria-modal), as the native action sheets were', () => {
    renderControlled();

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('asks to close on Escape', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderControlled();

    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('asks to close when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderControlled();

    await user.click(screen.getByTestId('overlay'));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('asks to close from a DialogClose button', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderControlled();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('moves focus into the dialog and keeps focus inside it', async () => {
    const user = userEvent.setup();
    render(
      <button type="button" data-testid="outside">
        Fora
      </button>,
    );
    renderControlled();

    await waitFor(() =>
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement),
    );
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    }

    // A focus move that is not a Tab keypress is pulled back in too, so the containment does not
    // rest on the Tab loop alone.
    screen.getByTestId('outside').focus();
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('returns focus to the trigger when closed (uncontrolled)', async () => {
    const user = userEvent.setup();
    render(
      <Dialog>
        <DialogTrigger>Abrir</DialogTrigger>
        <DialogContent>
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Descrição</DialogDescription>
          <DialogClose>Fechar</DialogClose>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: 'Abrir' });

    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('returns focus to the opener when the dialog is controlled and has no DialogTrigger', async () => {
    const user = userEvent.setup();
    function Parent() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Título</DialogTitle>
              <DialogDescription>Descrição</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Parent />);
    const opener = screen.getByRole('button', { name: 'Abrir' });

    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('lets a caller keep Radix from restoring focus by preventing the close auto-focus', async () => {
    const user = userEvent.setup();
    function Parent() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <button type="button">Outro</button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent onCloseAutoFocus={(event) => event.preventDefault()}>
              <DialogTitle>Título</DialogTitle>
              <DialogDescription>Descrição</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Parent />);
    const opener = screen.getByRole('button', { name: 'Abrir' });

    await user.click(opener);
    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(opener).not.toHaveFocus();
  });

  it('works controlled from a parent', async () => {
    const user = userEvent.setup();
    function Parent() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogTitle>Título</DialogTitle>
              <DialogDescription>Descrição</DialogDescription>
            </DialogContent>
          </Dialog>
        </>
      );
    }
    render(<Parent />);

    await user.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('lets a caller override the content position through className', () => {
    render(
      <Dialog open>
        <DialogContent className="bottom-0 top-auto">
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Descrição</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('dialog')).toHaveClass('bottom-0', 'top-auto');
    expect(screen.getByRole('dialog')).not.toHaveClass('top-1/2');
  });

  it('has no accessibility violations', async () => {
    renderControlled();

    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });
});
