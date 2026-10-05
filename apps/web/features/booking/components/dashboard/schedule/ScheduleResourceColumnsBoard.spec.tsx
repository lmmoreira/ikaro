// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type BookingStatus, type TenantBusinessHours } from '@ikaro/types';
import { axe } from '@/axe-helper';
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
  [BOOKING_STATUS.NO_SHOW]: 'Não compareceu',
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
    selectedStatusSet: new Set([BOOKING_STATUS.APPROVED]),
    closures: [],
    openings: [],
    selectedDateKey: '2026-08-17',
    // Deliberately not today's key by default — existing tests here aren't about scroll-to-now
    // (TD44 Story 4), which is covered by its own dedicated test below.
    todayKey: '2026-08-16',
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

  it('renders no redundant empty-column message for a checked resource with no blocks (TD44 Story 4 — the grid itself already shows this)', () => {
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
    expect(screen.getByText('Camila Duarte')).toBeInTheDocument();
    expect(screen.queryByText(/[Nn]ada agendado/)).not.toBeInTheDocument();
  });

  it('renders a scroll-to-now marker only in the first column, only when viewing today (TD44 Story 4)', () => {
    useScheduleDayGridMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        date: '2026-08-17',
        columns: [
          { resourceId: 'res-camila', name: 'Camila Duarte', type: 'STAFF', blocks: [] },
          { resourceId: 'res-bruno', name: 'Bruno Alves', type: 'STAFF', blocks: [] },
        ],
      },
    });
    renderWithIntl(
      <ScheduleResourceColumnsBoard {...baseProps()} todayKey={baseProps().selectedDateKey} />,
    );
    expect(screen.getAllByTestId('schedule-now-marker')).toHaveLength(1);
  });

  it('renders no scroll-to-now marker when the viewed date is not today (TD44 Story 4, non-regression)', () => {
    useScheduleDayGridMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        date: '2026-08-17',
        columns: [{ resourceId: 'res-camila', name: 'Camila Duarte', type: 'STAFF', blocks: [] }],
      },
    });
    renderWithIntl(<ScheduleResourceColumnsBoard {...baseProps()} />);
    expect(screen.queryByTestId('schedule-now-marker')).not.toBeInTheDocument();
  });

  it('renders one shared hour-label column for two checked resources on regular hours, not one per column (TD44 Story 3)', () => {
    useScheduleDayGridMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        date: '2026-08-17',
        columns: [
          { resourceId: 'res-camila', name: 'Camila Duarte', type: 'STAFF', blocks: [] },
          { resourceId: 'res-bruno', name: 'Bruno Alves', type: 'STAFF', blocks: [] },
        ],
      },
    });
    renderWithIntl(<ScheduleResourceColumnsBoard {...baseProps()} />);
    expect(screen.getAllByTestId('schedule-timeline-label-column')).toHaveLength(1);
  });

  it('keeps an independent hour-label column for a resource with an exceptional opening (TD44 Story 3)', () => {
    useScheduleDayGridMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        date: '2026-08-17',
        columns: [
          { resourceId: 'res-camila', name: 'Camila Duarte', type: 'STAFF', blocks: [] },
          { resourceId: 'res-bruno', name: 'Bruno Alves', type: 'STAFF', blocks: [] },
        ],
      },
    });
    renderWithIntl(
      <ScheduleResourceColumnsBoard
        {...baseProps()}
        openings={[
          {
            id: 'opening-1',
            date: '2026-08-17',
            startTime: '02:00',
            endTime: '04:00',
            notes: null,
            resourceId: 'res-camila',
          },
        ]}
      />,
    );
    // Camila (exceptional opening) keeps her own ruler; Bruno (regular hours, alone in the shared
    // group) still renders his own — two independent columns, neither suppressed.
    expect(screen.getAllByTestId('schedule-timeline-label-column')).toHaveLength(2);
  });

  it('renders a fixed spillover banner for a booking whose buffer pushed occupancy into this day, linking to the real booking (TD43)', () => {
    useScheduleDayGridMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        date: '2026-08-17',
        columns: [
          {
            resourceId: 'res-camila',
            name: 'Camila Duarte',
            type: 'STAFF',
            blocks: [
              {
                startsAt: '2026-08-17T02:50:00.000Z', // 2026-08-16T23:50 local
                endsAt: '2026-08-17T03:30:00.000Z', // 2026-08-17T00:30 local
                kind: 'BOOKING',
                refId: 'booking-spillover',
                gap: null,
              },
            ],
          },
        ],
      },
    });

    renderWithIntl(
      <ScheduleResourceColumnsBoard
        {...baseProps()}
        selectedResourceIdSet={new Set(['res-camila'])}
        bookings={[
          {
            bookingId: 'booking-spillover',
            status: BOOKING_STATUS.APPROVED,
            scheduledAt: '2026-08-17T02:50:00.000Z', // 2026-08-16 local — the booking's own day
            contactName: 'João Silva',
            serviceNames: ['Corte'],
            totalPrice: { amount: 100, currency: 'BRL' },
            totalDurationMins: 10,
            isCustomer: false,
            assignedResources: [],
          },
        ]}
      />,
    );

    const banner = screen.getByTestId('schedule-column-spillover-banner');
    expect(banner).toHaveTextContent('Ocupado até 00:30 — João Silva');
    expect(banner).toHaveAttribute(
      'href',
      expect.stringContaining('/dashboard/bookings/booking-spillover'),
    );
  });

  it('renders no spillover banner for a same-day booking (non-regression)', () => {
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
    expect(screen.queryByTestId('schedule-column-spillover-banner')).not.toBeInTheDocument();
  });

  describe('held tail after a booking (M18-S10)', () => {
    const booking = {
      bookingId: 'booking-1',
      status: BOOKING_STATUS.APPROVED,
      scheduledAt: '2026-08-17T12:00:00.000Z', // 09:00 local
      contactName: 'Carlos Mendes',
      serviceNames: ['Polimento'],
      totalPrice: { amount: 100, currency: 'BRL' },
      totalDurationMins: 30,
      isCustomer: false,
      assignedResources: [],
    };

    function mockGrid(
      columns: Array<{ resourceId: string; name: string; gap: unknown; endsAt: string }>,
    ) {
      useScheduleDayGridMock.mockReturnValue({
        isLoading: false,
        isError: false,
        data: {
          date: '2026-08-17',
          columns: columns.map((column) => ({
            resourceId: column.resourceId,
            name: column.name,
            type: 'STAFF',
            blocks: [
              {
                startsAt: '2026-08-17T12:00:00.000Z',
                endsAt: column.endsAt,
                kind: 'BOOKING',
                refId: 'booking-1',
                gap: column.gap,
              },
            ],
          })),
        },
      });
    }

    it('shows a service buffer in every resource column of the booking, each naming its own resource', () => {
      const gap = { source: 'SERVICE_BUFFER', minutes: 60, serviceName: 'Polimento' };
      mockGrid([
        {
          resourceId: 'res-camila',
          name: 'Camila Duarte',
          gap,
          endsAt: '2026-08-17T13:30:00.000Z',
        },
        { resourceId: 'res-bruno', name: 'Bruno Alves', gap, endsAt: '2026-08-17T13:30:00.000Z' },
      ]);

      renderWithIntl(<ScheduleResourceColumnsBoard {...baseProps()} bookings={[booking]} />);

      expect(screen.getByText('Camila Duarte · até 10:30')).toBeInTheDocument();
      expect(screen.getByText('Bruno Alves · até 10:30')).toBeInTheDocument();
      expect(screen.getAllByText('Buffer do serviço Polimento · 60 min')).toHaveLength(2);
    });

    it('shows a resource turnover only in the column of the resource that causes it', () => {
      mockGrid([
        {
          resourceId: 'res-camila',
          name: 'Camila Duarte',
          gap: { source: 'RESOURCE_TURNOVER', minutes: 30, serviceName: null },
          endsAt: '2026-08-17T13:00:00.000Z',
        },
        {
          resourceId: 'res-bruno',
          name: 'Bruno Alves',
          gap: null,
          endsAt: '2026-08-17T12:30:00.000Z',
        },
      ]);

      renderWithIntl(<ScheduleResourceColumnsBoard {...baseProps()} bookings={[booking]} />);

      expect(screen.getAllByRole('note')).toHaveLength(1);
      expect(screen.getByText('Camila Duarte · até 10:00')).toBeInTheDocument();
      expect(screen.getByText('Virada do recurso · 30 min')).toBeInTheDocument();
      expect(screen.queryByText(/Bruno Alves · até/)).not.toBeInTheDocument();
    });

    it('still names the resource and the origin when only that one resource is checked', () => {
      mockGrid([
        {
          resourceId: 'res-camila',
          name: 'Camila Duarte',
          gap: { source: 'RESOURCE_TURNOVER', minutes: 30, serviceName: null },
          endsAt: '2026-08-17T13:00:00.000Z',
        },
      ]);

      renderWithIntl(
        <ScheduleResourceColumnsBoard
          {...baseProps()}
          selectedResourceIdSet={new Set(['res-camila'])}
          bookings={[booking]}
        />,
      );

      expect(screen.getByText('Camila Duarte · até 10:00')).toBeInTheDocument();
      expect(screen.getByText('Virada do recurso · 30 min')).toBeInTheDocument();
    });

    it('shows "Origem não registrada" for a booking made before the origin was recorded', () => {
      mockGrid([
        {
          resourceId: 'res-camila',
          name: 'Camila Duarte',
          gap: null,
          endsAt: '2026-08-17T13:00:00.000Z',
        },
      ]);

      renderWithIntl(
        <ScheduleResourceColumnsBoard
          {...baseProps()}
          selectedResourceIdSet={new Set(['res-camila'])}
          bookings={[booking]}
        />,
      );

      expect(screen.getByText('Origem não registrada')).toBeInTheDocument();
    });

    it('has no accessibility violations with held tails rendered', async () => {
      const gap = { source: 'SERVICE_BUFFER', minutes: 60, serviceName: 'Polimento' };
      mockGrid([
        {
          resourceId: 'res-camila',
          name: 'Camila Duarte',
          gap,
          endsAt: '2026-08-17T13:30:00.000Z',
        },
        { resourceId: 'res-bruno', name: 'Bruno Alves', gap, endsAt: '2026-08-17T13:30:00.000Z' },
      ]);

      const { container } = renderWithIntl(
        <ScheduleResourceColumnsBoard {...baseProps()} bookings={[booking]} />,
      );

      expect(await axe(container)).toHaveNoViolations();
    });
  });
});
