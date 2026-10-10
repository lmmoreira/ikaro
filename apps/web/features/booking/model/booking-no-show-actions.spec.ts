import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { getBooking } from '@/features/booking/api/booking';
import { buildNoShowOutcomeHandlers } from './booking-no-show-actions';

vi.mock('@/features/booking/api/booking', () => ({ getBooking: vi.fn() }));

const approved = { bookingId: 'b-1', status: 'APPROVED' } as StaffBookingDetailResponse;
const fresh = {
  bookingId: 'b-1',
  status: 'NO_SHOW',
  statusHistory: [],
} as unknown as StaffBookingDetailResponse;

function setup() {
  let current = approved;
  const setBooking = vi.fn(
    (update: (c: StaffBookingDetailResponse) => StaffBookingDetailResponse) => {
      current = update(current);
    },
  );
  const setActionState = vi.fn();
  const setSheetState = vi.fn();
  const handlers = buildNoShowOutcomeHandlers({
    bookingId: 'b-1',
    setBooking,
    setActionState,
    setSheetState,
  });
  return { handlers, setBooking, setActionState, setSheetState, current: () => current };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('buildNoShowOutcomeHandlers', () => {
  beforeEach(() => {
    vi.mocked(getBooking).mockReset();
    vi.mocked(getBooking).mockResolvedValue(fresh);
  });

  it('marks the booking NO_SHOW locally, shows the success state and re-reads the history', async () => {
    const s = setup();

    s.handlers.onNoShowMarked();

    expect(s.current().status).toBe('NO_SHOW');
    expect(s.setActionState).toHaveBeenCalledWith('no-show');
    expect(s.setSheetState).toHaveBeenCalledWith(null);
    await flush();
    expect(getBooking).toHaveBeenCalledWith('b-1');
    expect(s.current()).toBe(fresh);
  });

  it('keeps the local state when the re-read fails', async () => {
    vi.mocked(getBooking).mockRejectedValue(new Error('offline'));
    const s = setup();

    s.handlers.onNoShowMarked();
    await flush();

    expect(s.current().status).toBe('NO_SHOW');
  });

  it.each(['no-show-not-ended', 'no-show-error'] as const)(
    'on %s shows the banner, leaves the booking unchanged and does not re-read',
    async (state) => {
      const s = setup();

      s.handlers.onNoShowFailed(state);
      await flush();

      expect(s.setActionState).toHaveBeenCalledWith(state);
      expect(s.setSheetState).toHaveBeenCalledWith(null);
      expect(s.setBooking).not.toHaveBeenCalled();
      expect(getBooking).not.toHaveBeenCalled();
    },
  );

  it('on already-closed shows the banner and re-reads the current state', async () => {
    const s = setup();

    s.handlers.onNoShowFailed('no-show-terminal');
    await flush();

    expect(s.setActionState).toHaveBeenCalledWith('no-show-terminal');
    expect(getBooking).toHaveBeenCalledWith('b-1');
  });

  it('marks the booking COMPLETED after a correction, shows the success state and re-reads', async () => {
    const s = setup();

    s.handlers.onNoShowCorrected();

    expect(s.current().status).toBe('COMPLETED');
    expect(s.setActionState).toHaveBeenCalledWith('corrected');
    await flush();
    expect(getBooking).toHaveBeenCalledTimes(1);
  });

  it.each(['correct-error', 'correct-forbidden'] as const)(
    'on %s shows the banner and changes nothing',
    async (state) => {
      const s = setup();

      s.handlers.onCorrectFailed(state);
      await flush();

      expect(s.setActionState).toHaveBeenCalledWith(state);
      expect(s.setBooking).not.toHaveBeenCalled();
      expect(getBooking).not.toHaveBeenCalled();
    },
  );

  it('refresh clears the banner and re-reads the booking', async () => {
    const s = setup();

    s.handlers.onRefresh();
    await flush();

    expect(s.setActionState).toHaveBeenCalledWith('idle');
    expect(getBooking).toHaveBeenCalledWith('b-1');
  });

  it('ignores an earlier re-read that resolves after a later one', async () => {
    const stale = {
      bookingId: 'b-1',
      status: 'NO_SHOW',
      statusHistory: [],
    } as unknown as StaffBookingDetailResponse;
    const latest = {
      bookingId: 'b-1',
      status: 'COMPLETED',
      statusHistory: [],
    } as unknown as StaffBookingDetailResponse;
    let resolveFirst: (value: StaffBookingDetailResponse) => void = () => undefined;
    vi.mocked(getBooking)
      .mockImplementationOnce(
        () => new Promise<StaffBookingDetailResponse>((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce(latest);
    const s = setup();

    s.handlers.onNoShowMarked();
    s.handlers.onNoShowCorrected();
    await flush();
    resolveFirst(stale);
    await flush();

    expect(s.current()).toBe(latest);
  });
});
