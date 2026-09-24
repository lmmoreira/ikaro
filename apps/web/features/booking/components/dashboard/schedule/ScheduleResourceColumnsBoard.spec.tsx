// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type BookingStatus, type TenantBusinessHours } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ScheduleResourceColumnsBoard } from './ScheduleResourceColumnsBoard';

const useScheduleDayGridMock = vi.fn();

vi.mock('@/features/booking/schedule/useSchedule', () => ({
  useScheduleDayGrid: (...args: unknown[]) => useScheduleDayGridMock(...args),
}));

const STATUS_LABELS: Record<BookingStatus, string> = {
  [BOOKING_STATUS.PENDING]: 'Pendente',
  [BOOKING_STATUS.INFO_REQUESTED]: 'Info solicitada',
  [BOOKING_STATUS.APPROVED]: 'Aprovado',
  [BOOKING_STATUS.REJECTED]: 'Rejeitado',
  [BOOKING_STATUS.CANCELLED]: 'Cancelado',
  [BOOKING_STATUS.COMPLETED]: 'Concluído',
};

const BUSINESS_HOURS: TenantBusinessHours = {
  timezone: 'America/Sao_Paulo',
  monday: { open: '09:00', close: '18:00' },
  tuesday: { open: '09:00', close: '18:00' },
  wednesday: { open: '09:00', close: '18:00' },
  thursday: { open: '09:00', close: '18:00' },
  friday: { open: '09:00', close: '18:00' },
  saturday: null,
  sunday: null,
};

function baseProps() {
  return {
    selectedResourceIdSet: new Set(['res-camila', 'res-bruno']),
    resourceNameById: new Map([
      ['res-camila', 'Camila Duarte'],
      ['res-bruno', 'Bruno Alves'],
    ]),
    bookings: [],
    closures: [],
    openings: [],
    selectedDateKey: '2026-08-17',
    businessHours: BUSINESS_HOURS,
    slotGranularityMinutes: 30 as const,
    statusLabels: STATUS_LABELS,
    timezone: 'America/Sao_Paulo',
    scheduleReturnTo: '/dashboard/schedule',
    onOpeningClick: vi.fn(),
    onClosureClick: vi.fn(),
  };
}

describe('ScheduleResourceColumnsBoard', () => {
  it('shows a loading state while the day-grid fetch is in flight', () => {
    useScheduleDayGridMock.mockReturnValue({ isLoading: true, isError: false, data: undefined });
    renderWithIntl(<ScheduleResourceColumnsBoard {...baseProps()} />);
    expect(screen.getByText('Carregando...')).toBeInTheDocument();
    expect(screen.queryByTestId('schedule-resource-columns-board')).not.toBeInTheDocument();
  });

  it('shows an error message when the day-grid fetch fails', () => {
    useScheduleDayGridMock.mockReturnValue({
      isLoading: false,
      isError: true,
      error: new Error('boom'),
      data: undefined,
    });
    renderWithIntl(<ScheduleResourceColumnsBoard {...baseProps()} />);
    expect(
      screen.getByText(/Não foi possível carregar as colunas dos recursos/),
    ).toBeInTheDocument();
  });

  it('renders exactly one column per checked resource, not for an unchecked one present in the response', () => {
    useScheduleDayGridMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        date: '2026-08-17',
        columns: [
          { resourceId: 'res-camila', name: 'Camila Duarte', type: 'STAFF', blocks: [] },
          { resourceId: 'res-bruno', name: 'Bruno Alves', type: 'STAFF', blocks: [] },
          { resourceId: 'res-renata', name: 'Renata Souza', type: 'STAFF', blocks: [] },
        ],
      },
    });
    renderWithIntl(<ScheduleResourceColumnsBoard {...baseProps()} />);
    const columns = screen.getAllByTestId('schedule-resource-column');
    expect(columns).toHaveLength(2);
    expect(screen.getByText('Camila Duarte')).toBeInTheDocument();
    expect(screen.getByText('Bruno Alves')).toBeInTheDocument();
    expect(screen.queryByText('Renata Souza')).not.toBeInTheDocument();
  });

  it('shows an explicit empty-column message for a checked resource with no blocks that day', () => {
    useScheduleDayGridMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        date: '2026-08-17',
        columns: [{ resourceId: 'res-camila', name: 'Camila Duarte', type: 'STAFF', blocks: [] }],
      },
    });
    renderWithIntl(
      <ScheduleResourceColumnsBoard
        {...baseProps()}
        selectedResourceIdSet={new Set(['res-camila'])}
      />,
    );
    expect(screen.getByText('Nada agendado neste dia')).toBeInTheDocument();
  });
});
