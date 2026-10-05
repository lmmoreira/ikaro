// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useTranslations } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS, type BookingStatus } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import type { TimelineDayData, TimelineEvent } from '@/features/booking/schedule/schedule-timeline';
import {
  renderTimelineEvent,
  type ScheduleTimelineRenderProps,
} from './ScheduleTimelineEventRenderer';

const STATUS_LABELS: Record<BookingStatus, string> = {
  [BOOKING_STATUS.PENDING]: 'Pendente',
  [BOOKING_STATUS.INFO_REQUESTED]: 'Info solicitada',
  [BOOKING_STATUS.APPROVED]: 'Aprovado',
  [BOOKING_STATUS.REJECTED]: 'Rejeitado',
  [BOOKING_STATUS.CANCELLED]: 'Cancelado',
  [BOOKING_STATUS.COMPLETED]: 'Concluído',
  [BOOKING_STATUS.NO_SHOW]: 'Não compareceu',
};

const TIMELINE: TimelineDayData = {
  selectedOpening: null,
  selectedDayHours: { open: '09:00', close: '10:00' },
  selectedDayClosed: false,
  timelineStartMinutes: 540,
  timelineEndMinutes: 600,
  slotCount: 2,
  slotHeight: 48,
  events: [],
  isOverriddenByOpening: false,
};

function baseProps(
  overrides: Partial<ScheduleTimelineRenderProps> = {},
): ScheduleTimelineRenderProps {
  return {
    slotGranularityMinutes: 30,
    statusLabels: STATUS_LABELS,
    timezone: 'America/Sao_Paulo',
    scheduleReturnTo: '/dashboard/schedule',
    onOpeningClick: vi.fn(),
    onClosureClick: vi.fn(),
    ...overrides,
  };
}

function Host({
  event,
  props,
  compact = false,
}: {
  readonly event: TimelineEvent;
  readonly props: ScheduleTimelineRenderProps;
  readonly compact?: boolean;
}): React.JSX.Element {
  const t = useTranslations('dashboard.schedule');
  return renderTimelineEvent(event, TIMELINE, compact, props, t);
}

describe('renderTimelineEvent', () => {
  it('renders a booking event as a link to the booking detail page', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: [],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30,
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    const link = screen.getByRole('link', { name: 'João Silva' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/dashboard/bookings/booking-1'));
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
  });

  it('gives a booking in a shared (narrow) lane one more line of minimum height for the wrapped badge', () => {
    const makeEvent = (laneCount: number): TimelineEvent => ({
      kind: 'booking',
      id: `booking-${laneCount}`,
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: [],
      laneIndex: 0,
      laneCount,
      booking: {
        bookingId: `booking-${laneCount}`,
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30,
      } as never,
    });
    const minHeightOf = (laneCount: number): number => {
      const { unmount } = renderWithIntl(<Host event={makeEvent(laneCount)} props={baseProps()} />);
      const value = Number.parseInt(screen.getByRole('link').style.minHeight, 10);
      unmount();
      return value;
    };

    expect(minHeightOf(2)).toBeGreaterThan(minHeightOf(1));
  });

  it("composes the booking link's own accessible name from contactName + every matched resource (TD44 Story 2 round 3)", () => {
    const baseEvent = {
      kind: 'booking' as const,
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30,
      } as never,
    };

    const { unmount: unmountZero } = renderWithIntl(
      <Host event={{ ...baseEvent, resourceNames: [] }} props={baseProps()} />,
    );
    expect(screen.getByRole('link', { name: 'João Silva' })).toBeInTheDocument();
    unmountZero();

    const { unmount: unmountOne } = renderWithIntl(
      <Host event={{ ...baseEvent, resourceNames: ['Camila Duarte'] }} props={baseProps()} />,
    );
    expect(screen.getByRole('link', { name: 'João Silva, Camila Duarte' })).toBeInTheDocument();
    unmountOne();

    renderWithIntl(
      <Host
        event={{ ...baseEvent, resourceNames: ['Camila Duarte', 'Sala 1'] }}
        props={baseProps()}
      />,
    );
    expect(
      screen.getByRole('link', { name: 'João Silva, Camila Duarte, Sala 1' }),
    ).toBeInTheDocument();
  });

  it('renders no resource-summary line on a booking when resourceNames is empty (TD44 Story 2)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: [],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30,
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    expect(screen.queryByTestId('timeline-block-resource-summary')).not.toBeInTheDocument();
    // Booking blocks never render the openings/closures-only per-resource badge either.
    expect(screen.queryByTestId('timeline-block-resource-name')).not.toBeInTheDocument();
  });

  it('shows the resource name with no "+N" for exactly one matched resource (TD44 Story 2)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: ['Camila Duarte'],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30,
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    const line = screen.getByTestId('timeline-block-resource-summary');
    expect(line).toHaveTextContent('Camila Duarte');
    expect(line).not.toHaveTextContent('+');
  });

  it('shows the primary type-prioritized name + "+N" for a booking matching 2+ resources (TD44 Story 2)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      // Already type-prioritized by the data layer (buildBookingResourceNamesById) — the renderer
      // only ever reads index 0 + length, it never re-sorts.
      resourceNames: ['Camila Duarte', 'Sala 1'],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30,
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    const line = screen.getByTestId('timeline-block-resource-summary');
    expect(line).toHaveTextContent('Camila Duarte +1');
    // The visible summary line is aria-hidden; the full matched-resource list reaches assistive
    // tech via the enclosing booking link's own accessible name instead (it's the one focusable/
    // announced unit — an inner div's own name would never be separately reached by a screen
    // reader tabbing through the page regardless of how it's built).
    const link = screen.getByRole('link', { name: 'João Silva, Camila Duarte, Sala 1' });
    expect(link).toBeInTheDocument();
  });

  it('renders the resource-summary line before the time-range text within the footer (TD44 Story 2)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 600,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: ['Camila Duarte'],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 60,
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    const link = screen.getByRole('link', { name: 'João Silva, Camila Duarte' });
    const resourceLine = screen.getByTestId('timeline-block-resource-summary');
    const position = resourceLine.compareDocumentPosition(link);
    // link (the whole block) contains resourceLine; assert the resource line comes before the
    // formatted time-range text in document order.
    const allText = link.textContent ?? '';
    expect(position & Node.DOCUMENT_POSITION_CONTAINS).toBeTruthy();
    // scheduledAt 2026-08-18T12:00:00.000Z in America/Sao_Paulo (UTC-3) is 09:00 local.
    expect(allText.indexOf('Camila Duarte')).toBeLessThan(allText.indexOf('09:00'));
  });

  it('in Day view (desktop), always shows the time-range line at minimum granularity, alongside the resource-summary line (TD44 Story 5 — reverts Story 4)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: ['Camila Duarte'],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30, // equals baseProps().slotGranularityMinutes (30)
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    expect(screen.getByTestId('timeline-block-resource-summary')).toHaveTextContent(
      'Camila Duarte',
    );
    // scheduledAt 2026-08-18T12:00:00.000Z in America/Sao_Paulo (UTC-3) is 09:00 local.
    expect(screen.getByText('09:00–09:30')).toBeInTheDocument();
  });

  it('in Week view (compact), a minimum-granularity booking with a resource shows both the resource-summary and time-range lines (TD44 Story 5 — reverts Story 4)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: ['Camila Duarte'],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30, // equals baseProps().slotGranularityMinutes (30)
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} compact />);
    expect(screen.getByTestId('timeline-block-resource-summary')).toHaveTextContent(
      'Camila Duarte',
    );
    expect(screen.getByText('09:00–09:30')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'João Silva, Camila Duarte' });
    expect(link.style.minHeight).toBe('96px');
  });

  it('in Week view (compact), a longer booking with a resource keeps both footer lines (non-regression)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 600,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: ['Camila Duarte'],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 60, // longer than baseProps().slotGranularityMinutes (30)
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} compact />);
    expect(screen.getByTestId('timeline-block-resource-summary')).toHaveTextContent(
      'Camila Duarte',
    );
    const link = screen.getByRole('link', { name: 'João Silva, Camila Duarte' });
    expect(link.style.minHeight).toBe('96px');
  });

  it('keeps the time-range line for a booking longer than the minimum granularity (non-regression)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 600,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: [],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 60, // longer than baseProps().slotGranularityMinutes (30)
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    expect(screen.getByText('09:00–10:00')).toBeInTheDocument();
  });

  it('shows the time-range line for a minimum-granularity booking with no assigned resource (TD44 Story 5 — no blank/broken layout)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: [],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30, // equals baseProps().slotGranularityMinutes (30)
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    expect(screen.queryByTestId('timeline-block-resource-summary')).not.toBeInTheDocument();
    expect(screen.getByText('09:00–09:30')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'João Silva' });
    expect(link.style.minHeight).toBe('84px');
  });

  it('applies the content-fit min-height to a block, decoupled from the grid unit (TD44 Story 4) — closures/openings have no footer, so the 0-extra-line floor applies', () => {
    const closure = {
      id: 'closure-1',
      reason: 'MAINTENANCE',
      notes: null,
      startTime: null,
      endTime: null,
    } as never;
    const event: TimelineEvent = {
      kind: 'closure',
      id: 'closure-1',
      startMinutes: 540,
      endMinutes: 600,
      title: '',
      subtitle: '',
      closure,
      resourceName: null,
      laneIndex: 0,
      laneCount: 1,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    const block = screen.getByTestId('schedule-closure-block-closure-1');
    // Host always renders with compact=false (desktop) — 0 extra lines -> the desktop base floor.
    expect(block.style.minHeight).toBe('60px');
  });

  it('applies the full 2-extra-line desktop floor to a longer booking with an assigned resource (both footer lines render)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 600,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: ['Camila Duarte'],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 60, // longer than baseProps().slotGranularityMinutes (30)
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    const link = screen.getByRole('link', { name: 'João Silva, Camila Duarte' });
    expect(link.style.minHeight).toBe('108px');
  });

  it('applies the full desktop 2-extra-line floor to a minimum-granularity booking with a resource (TD44 Story 5 — both lines always render)', () => {
    const event: TimelineEvent = {
      kind: 'booking',
      id: 'booking-1',
      startMinutes: 540,
      endMinutes: 570,
      title: 'João Silva',
      subtitle: 'Lavagem completa',
      warning: false,
      resourceNames: ['Camila Duarte'],
      laneIndex: 0,
      laneCount: 1,
      booking: {
        bookingId: 'booking-1',
        contactName: 'João Silva',
        serviceNames: ['Lavagem completa'],
        status: BOOKING_STATUS.APPROVED,
        scheduledAt: '2026-08-18T12:00:00.000Z',
        totalDurationMins: 30, // equals baseProps().slotGranularityMinutes (30)
      } as never,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    const link = screen.getByRole('link', { name: 'João Silva, Camila Duarte' });
    expect(link.style.minHeight).toBe('108px');
    expect(screen.getByTestId('timeline-block-resource-summary')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-block-time-range')).toBeInTheDocument();
  });

  it('renders an opening event as a button that calls onOpeningClick', async () => {
    const user = userEvent.setup();
    const opening = { id: 'opening-1', notes: null, startTime: '09:00', endTime: '10:00' } as never;
    const event: TimelineEvent = {
      kind: 'opening',
      id: 'opening-1',
      startMinutes: 540,
      endMinutes: 600,
      title: '',
      subtitle: '',
      opening,
      resourceName: null,
      laneIndex: 0,
      laneCount: 1,
    };
    const props = baseProps();

    renderWithIntl(<Host event={event} props={props} />);
    expect(screen.getByTestId('schedule-opening-block-opening-1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Abertura especial/ }));
    expect(props.onOpeningClick).toHaveBeenCalledWith(opening);
  });

  it('renders a closure event as a button that calls onClosureClick', async () => {
    const user = userEvent.setup();
    const closure = {
      id: 'closure-1',
      reason: 'MAINTENANCE',
      notes: null,
      startTime: null,
      endTime: null,
    } as never;
    const event: TimelineEvent = {
      kind: 'closure',
      id: 'closure-1',
      startMinutes: 540,
      endMinutes: 600,
      title: '',
      subtitle: '',
      closure,
      resourceName: null,
      laneIndex: 0,
      laneCount: 1,
    };
    const props = baseProps();

    renderWithIntl(<Host event={event} props={props} />);
    expect(screen.getByTestId('schedule-closure-block-closure-1')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Manutenção/ }));
    expect(screen.getByText('Dia inteiro')).toBeInTheDocument();
    expect(props.onClosureClick).toHaveBeenCalledWith(closure);
  });

  it('shows the resource-name badge on a resource-scoped closure but not on a tenant-wide one', () => {
    const closure = {
      id: 'closure-1',
      reason: 'MAINTENANCE',
      notes: null,
      startTime: null,
      endTime: null,
    } as never;
    const event: TimelineEvent = {
      kind: 'closure',
      id: 'closure-1',
      startMinutes: 540,
      endMinutes: 600,
      title: '',
      subtitle: '',
      closure,
      resourceName: 'Leonardo',
      laneIndex: 0,
      laneCount: 1,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    expect(screen.getByText('Leonardo')).toBeInTheDocument();
  });

  it("splits a closure's block width/position according to its lane assignment", () => {
    const closure = {
      id: 'closure-1',
      reason: 'MAINTENANCE',
      notes: null,
      startTime: null,
      endTime: null,
    } as never;
    const event: TimelineEvent = {
      kind: 'closure',
      id: 'closure-1',
      startMinutes: 540,
      endMinutes: 600,
      title: '',
      subtitle: '',
      closure,
      resourceName: 'Walace',
      laneIndex: 1,
      laneCount: 2,
    };

    renderWithIntl(<Host event={event} props={baseProps()} />);
    const block = screen.getByTestId('schedule-closure-block-closure-1');
    expect(block.style.left).toBe('50%');
    expect(block.style.width).toBe('50%');
  });

  it('renders a buffer event as a non-interactive held-time note (M18-S10)', () => {
    renderWithIntl(
      <Host
        event={{
          kind: 'buffer',
          id: 'buffer-booking-1',
          startMinutes: 570,
          endMinutes: 600,
          title: 'Walace',
          subtitle: '',
          resourceName: 'Walace',
          releasesAtLocalTime: '10:00',
          gap: { source: 'RESOURCE_TURNOVER', minutes: 30, serviceName: null },
          serviceName: 'Polimento',
          laneIndex: 0,
          laneCount: 1,
        }}
        props={baseProps()}
      />,
    );

    expect(screen.getByRole('note')).toHaveTextContent('Walace · até 10:00');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reserves one more line for a resource-scoped opening or closure badge only in a shared lane', () => {
    const makeOpening = (resourceName: string | null, laneCount: number): TimelineEvent => ({
      kind: 'opening',
      id: `opening-${resourceName}-${laneCount}`,
      startMinutes: 540,
      endMinutes: 600,
      title: '',
      subtitle: '',
      opening: { id: 'o', notes: null, startTime: '09:00', endTime: '10:00' } as never,
      resourceName,
      laneIndex: 0,
      laneCount,
    });
    const makeClosure = (resourceName: string | null, laneCount: number): TimelineEvent => ({
      kind: 'closure',
      id: `closure-${resourceName}-${laneCount}`,
      startMinutes: 540,
      endMinutes: 600,
      title: '',
      subtitle: '',
      closure: { id: 'c', reason: 'MAINTENANCE', notes: null } as never,
      resourceName,
      laneIndex: 0,
      laneCount,
    });
    const minHeightOf = (event: TimelineEvent): number => {
      const { unmount } = renderWithIntl(<Host event={event} props={baseProps()} />);
      const value = Number.parseInt(screen.getByRole('button').style.minHeight, 10);
      unmount();
      return value;
    };

    for (const make of [makeOpening, makeClosure]) {
      const tenantWide = minHeightOf(make(null, 2));
      const scopedAlone = minHeightOf(make('Walace', 1));
      const scopedShared = minHeightOf(make('Walace', 2));
      expect(scopedShared).toBeGreaterThan(scopedAlone);
      expect(tenantWide).toBe(scopedAlone);
    }
  });
});
