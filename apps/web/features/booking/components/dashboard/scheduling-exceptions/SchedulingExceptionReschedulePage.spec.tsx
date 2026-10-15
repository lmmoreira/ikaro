// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { SchedulingExceptionReschedulePage } from './SchedulingExceptionReschedulePage';

const push = vi.hoisted(() => vi.fn());
const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

vi.mock('@/features/booking/hooks/useSchedulingExceptions', () => ({
  useResolveSchedulingExceptions: () => ({ mutateAsync }),
}));

// The page under test only wires the resolve into the existing staff reschedule page; that page's
// own behavior (slots, conflicts, notes) is covered by RescheduleBookingPage.spec.tsx.
interface CapturedProps {
  readonly booking: StaffBookingDetailResponse;
  readonly backHref: string;
  readonly agendaHref: string;
  readonly confirmReschedule: (input: { startsAt: string; adminNotes?: string }) => Promise<void>;
  readonly onRescheduled: () => void;
}
const captured = vi.hoisted(() => ({ props: null as unknown }));

vi.mock('@/features/booking/components/dashboard/bookings/RescheduleBookingPage', () => ({
  RescheduleBookingPage: (props: unknown) => {
    captured.props = props;
    return <div data-testid="staff-reschedule-page" />;
  },
}));

const booking = { bookingId: 'bk-1', status: 'APPROVED' } as StaffBookingDetailResponse;
const props = () => captured.props as CapturedProps;

function renderPage() {
  render(
    <SchedulingExceptionReschedulePage
      exceptionId="exc-1"
      booking={booking}
      tenantSlug="lavacar"
      maxBookingAdvanceDays={90}
      timezone="America/Sao_Paulo"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  captured.props = null;
});

describe('SchedulingExceptionReschedulePage', () => {
  it('renders the existing staff reschedule page, with the list as its back and agenda target', () => {
    renderPage();

    expect(screen.getByTestId('staff-reschedule-page')).toBeInTheDocument();
    expect(props().booking).toBe(booking);
    expect(props().backHref).toBe('/dashboard/scheduling-exceptions');
    expect(props().agendaHref).toBe('/dashboard/scheduling-exceptions');
  });

  it('confirms through the worklist resolve (RESCHEDULE, one id, the new time), never PATCH /bookings/:id/reschedule', async () => {
    mutateAsync.mockResolvedValue({
      results: [{ exceptionId: 'exc-1', outcome: 'RESOLVED' }],
      notProcessed: [],
    });
    renderPage();

    await props().confirmReschedule({
      startsAt: '2026-12-11T14:00:00.000Z',
      adminNotes: 'Box 2 fechou',
    });

    expect(mutateAsync).toHaveBeenCalledWith({
      exceptionIds: ['exc-1'],
      resolutionType: 'RESCHEDULE',
      scheduledAt: '2026-12-11T14:00:00.000Z',
      reason: 'Box 2 fechou',
    });
  });

  it('sends no reason when the manager wrote no note', async () => {
    mutateAsync.mockResolvedValue({
      results: [{ exceptionId: 'exc-1', outcome: 'RESOLVED' }],
      notProcessed: [],
    });
    renderPage();

    await props().confirmReschedule({ startsAt: '2026-12-11T14:00:00.000Z' });

    expect(mutateAsync).toHaveBeenCalledWith({
      exceptionIds: ['exc-1'],
      resolutionType: 'RESCHEDULE',
      scheduledAt: '2026-12-11T14:00:00.000Z',
    });
  });

  it('signals a taken slot as the 409 the staff page already handles', async () => {
    mutateAsync.mockResolvedValue({
      results: [
        { exceptionId: 'exc-1', outcome: 'STILL_OPEN', errorCode: 'BOOKING_SLOT_UNAVAILABLE' },
      ],
      notProcessed: [],
    });
    renderPage();

    const failure = await props()
      .confirmReschedule({ startsAt: '2026-12-11T14:00:00.000Z' })
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(409);
  });

  it('goes back to the list once the booking was rescheduled', () => {
    renderPage();

    props().onRescheduled();

    expect(push).toHaveBeenCalledWith('/dashboard/scheduling-exceptions');
  });
});
