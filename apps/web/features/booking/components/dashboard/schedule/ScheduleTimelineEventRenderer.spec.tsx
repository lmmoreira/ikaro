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
        // Longer than baseProps' slotGranularityMinutes (30) so the time-range line still renders
        // (TD44 Story 4 drops it only at exact minimum granularity) — this test is about ordering,
        // not about the minimum-granularity variant itself.
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

  it('in Day view (desktop), drops only the time-range line at minimum granularity, keeping the resource-summary line (TD44 Story 4)', () => {
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
    expect(screen.queryByText('09:00–09:30')).not.toBeInTheDocument();
  });

  it('in Week view (compact), a minimum-granularity booking with a resource drops only the time-range line, keeping the resource-summary line (TD44 Story 4 — Week view resource filtering depends on this staying visible)', () => {
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
    expect(screen.queryByText('09:00–09:30')).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'João Silva, Camila Duarte' });
    expect(link.style.minHeight).toBe('72px');
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

  it('keeps the time-range line for a booking longer than the minimum granularity (TD44 Story 4)', () => {
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

  it('applies only the desktop 1-extra-line floor to a minimum-granularity booking with a resource (Day view keeps the resource line, drops only time-range)', () => {
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
    expect(link.style.minHeight).toBe('84px');
    expect(screen.getByTestId('timeline-block-resource-summary')).toBeInTheDocument();
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
});
