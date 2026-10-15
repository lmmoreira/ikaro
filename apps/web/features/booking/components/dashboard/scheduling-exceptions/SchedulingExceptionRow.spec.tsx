// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { makeSchedulingException } from './scheduling-exception.fixtures';
import { SchedulingExceptionRow } from './SchedulingExceptionRow';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'aria-label': ariaLabel,
  }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
    'aria-label'?: string;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

const handlers = () => ({
  onToggleSelected: vi.fn(),
  onReassign: vi.fn(),
  onCancel: vi.fn(),
});

describe('SchedulingExceptionRow', () => {
  it('draws the queue card: name, Cliente + Aprovado pills, service, time and price · duration', () => {
    renderWithIntl(<SchedulingExceptionRow item={makeSchedulingException()} {...handlers()} />);

    expect(screen.getByText('João Silva')).toBeInTheDocument();
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?60,00 · 30 min/)).toBeInTheDocument();
  });

  it('shows Visitante for a guest booking and Pendente for a pending one', () => {
    renderWithIntl(
      <SchedulingExceptionRow
        item={makeSchedulingException({ booking: { isCustomer: false, status: 'PENDING' } })}
        {...handlers()}
      />,
    );

    expect(screen.getByText('Visitante')).toBeInTheDocument();
    expect(screen.getByText('Pendente')).toBeInTheDocument();
  });

  it('links the whole card to the booking detail', () => {
    renderWithIntl(
      <SchedulingExceptionRow item={makeSchedulingException({ id: 'exc-9' })} {...handlers()} />,
    );

    expect(
      screen.getByRole('link', { name: 'Ver detalhes do agendamento de João Silva' }),
    ).toHaveAttribute(
      'href',
      '/dashboard/bookings/bk-exc-9?returnTo=%2Fdashboard%2Fscheduling-exceptions',
    );
  });

  it('offers Reatribuir, Reagendar (a link to the entry’s reschedule route) and Cancelar for a confirmed booking', async () => {
    const user = userEvent.setup();
    const h = handlers();
    renderWithIntl(
      <SchedulingExceptionRow item={makeSchedulingException({ id: 'exc-9' })} {...h} />,
    );

    expect(screen.getByRole('link', { name: 'Reagendar' })).toHaveAttribute(
      'href',
      '/dashboard/scheduling-exceptions/exc-9/reschedule',
    );
    await user.click(screen.getByRole('button', { name: 'Reatribuir' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(h.onReassign).toHaveBeenCalledWith('exc-9');
    expect(h.onCancel).toHaveBeenCalledWith('exc-9');
  });

  it.each(['PENDING', 'INFO_REQUESTED'])(
    'has no Reagendar for a %s booking (only a confirmed one can be rescheduled)',
    (status) => {
      renderWithIntl(
        <SchedulingExceptionRow
          item={makeSchedulingException({ booking: { status } })}
          {...handlers()}
        />,
      );

      expect(screen.queryByRole('link', { name: 'Reagendar' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    },
  );

  it('never offers Manter or Dispensar', () => {
    renderWithIntl(<SchedulingExceptionRow item={makeSchedulingException()} {...handlers()} />);

    expect(screen.queryByText(/manter|dispensar/i)).not.toBeInTheDocument();
  });

  it('toggles the selection from the checkbox without opening anything', async () => {
    const user = userEvent.setup();
    const h = handlers();
    renderWithIntl(
      <SchedulingExceptionRow item={makeSchedulingException({ id: 'exc-9' })} {...h} />,
    );

    await user.click(screen.getByRole('checkbox', { name: 'Selecionar a reserva de João Silva' }));

    expect(h.onToggleSelected).toHaveBeenCalledWith('exc-9');
  });

  it('reflects the selected state on the card and the checkbox', () => {
    renderWithIntl(
      <SchedulingExceptionRow item={makeSchedulingException()} selected {...handlers()} />,
    );

    expect(screen.getByRole('checkbox')).toBeChecked();
  });

  describe('the info line', () => {
    it('names the deactivated resource and the single alternative', () => {
      renderWithIntl(<SchedulingExceptionRow item={makeSchedulingException()} {...handlers()} />);

      expect(screen.getByText(/Box 2 desativado/)).toBeInTheDocument();
      expect(screen.getByText('Alternativa: Box 1')).toBeInTheDocument();
    });

    it('says there is no compatible alternative when none is stored', () => {
      renderWithIntl(
        <SchedulingExceptionRow
          item={makeSchedulingException({ alternatives: [] })}
          {...handlers()}
        />,
      );

      expect(
        screen.getByText('Sem alternativa compatível — reagende ou cancele'),
      ).toBeInTheDocument();
    });

    it('disables Reatribuir when none is stored, and keeps Reagendar and Cancelar', () => {
      renderWithIntl(
        <SchedulingExceptionRow
          item={makeSchedulingException({ alternatives: [] })}
          {...handlers()}
        />,
      );

      expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
    });

    it('lists at most two alternatives and counts the rest', () => {
      const alternatives = ['Box 1', 'Box 3', 'Box 4', 'Box 5'].map((resourceName, i) => ({
        resourceId: `r${i}`,
        resourceName,
      }));
      renderWithIntl(
        <SchedulingExceptionRow item={makeSchedulingException({ alternatives })} {...handlers()} />,
      );

      expect(screen.getByText('Alternativas: Box 1, Box 3 e mais 2')).toBeInTheDocument();
    });
  });

  it('draws a minimal "Reserva indisponível" card, with no checkbox and no actions, when the booking cannot be read', () => {
    renderWithIntl(
      <SchedulingExceptionRow item={makeSchedulingException({ booking: null })} {...handlers()} />,
    );

    const card = screen.getByTestId('scheduling-exception-unavailable');
    expect(within(card).getByText('Reserva indisponível')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  describe('in the result list', () => {
    it('a resolved entry shows a Resolvida pill and has nothing left to select or act on', () => {
      renderWithIntl(
        <SchedulingExceptionRow
          item={makeSchedulingException()}
          outcome={{ kind: 'resolved' }}
          {...handlers()}
        />,
      );

      expect(screen.getByText('Resolvida')).toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Reagendar' })).not.toBeInTheDocument();
    });

    it('a still-open entry shows why it stayed open and keeps its actions', () => {
      renderWithIntl(
        <SchedulingExceptionRow
          item={makeSchedulingException()}
          outcome={{ kind: 'open', reason: 'o horário foi ocupado' }}
          {...handlers()}
        />,
      );

      expect(screen.getByTestId('still-open-reason')).toHaveTextContent(
        'Continua aberta: o horário foi ocupado',
      );
      expect(screen.getByRole('button', { name: 'Reatribuir' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Reagendar' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
    });
  });
});
