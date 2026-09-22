// @vitest-environment jsdom
import { createRef } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ScheduleStatusFilterMenu } from './ScheduleStatusFilterMenu';

const STATUS_LABELS: Record<BookingStatus, string> = {
  [BOOKING_STATUS.PENDING]: 'Pendente',
  [BOOKING_STATUS.INFO_REQUESTED]: 'Info solicitada',
  [BOOKING_STATUS.APPROVED]: 'Aprovado',
  [BOOKING_STATUS.REJECTED]: 'Rejeitado',
  [BOOKING_STATUS.CANCELLED]: 'Cancelado',
  [BOOKING_STATUS.COMPLETED]: 'Concluído',
};

function baseProps() {
  return {
    containerRef: createRef<HTMLDivElement>(),
    open: false,
    onToggleOpen: vi.fn(),
    selectedStatusSet: new Set<BookingStatus>([BOOKING_STATUS.APPROVED]),
    statusLabels: STATUS_LABELS,
    onToggleStatus: vi.fn(),
    onReset: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('ScheduleStatusFilterMenu', () => {
  it('does not render the popover content when closed', () => {
    renderWithIntl(<ScheduleStatusFilterMenu {...baseProps()} />);
    expect(screen.queryByText('Status visíveis')).not.toBeInTheDocument();
  });

  it('renders the popover and calls onToggleStatus for a checkbox', async () => {
    const user = userEvent.setup();
    const props = { ...baseProps(), open: true };
    renderWithIntl(<ScheduleStatusFilterMenu {...props} />);

    expect(screen.getByText('Status visíveis')).toBeInTheDocument();
    const approvedCheckbox = screen.getByRole('checkbox', { name: 'Aprovado' });
    expect(approvedCheckbox).toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: 'Pendente' }));
    expect(props.onToggleStatus).toHaveBeenCalledWith(BOOKING_STATUS.PENDING);
  });

  it('calls onReset and onClose from the popover footer', async () => {
    const user = userEvent.setup();
    const props = { ...baseProps(), open: true };
    renderWithIntl(<ScheduleStatusFilterMenu {...props} />);

    await user.click(screen.getByRole('button', { name: 'Padrão' }));
    expect(props.onReset).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onToggleOpen when the trigger button is clicked', async () => {
    const user = userEvent.setup();
    const props = baseProps();
    renderWithIntl(<ScheduleStatusFilterMenu {...props} />);

    await user.click(screen.getByRole('button', { name: 'Filtrar status' }));
    expect(props.onToggleOpen).toHaveBeenCalledTimes(1);
  });
});
