import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { buildBookingSheetOutcomes } from './booking-sheet-outcomes';

function setup() {
  let current = {
    bookingId: 'b-1',
    status: 'PENDING',
    rejectionReason: null,
    infoRequestMessage: null,
  } as unknown as StaffBookingDetailResponse;
  const setBooking = vi.fn(
    (update: (c: StaffBookingDetailResponse) => StaffBookingDetailResponse) => {
      current = update(current);
    },
  );
  const setActionState = vi.fn();
  const setSheetState = vi.fn();
  const outcomes = buildBookingSheetOutcomes({ setBooking, setActionState, setSheetState });
  return { outcomes, setActionState, setSheetState, current: () => current };
}

describe('buildBookingSheetOutcomes', () => {
  it('rejects: stores the reason, closes the sheet, shows the rejected banner', () => {
    const s = setup();

    s.outcomes.onRejected('Sem disponibilidade');

    expect(s.current()).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Sem disponibilidade',
    });
    expect(s.setSheetState).toHaveBeenCalledWith(null);
    expect(s.setActionState).toHaveBeenCalledWith('rejected');
  });

  it('requests info: stores the message, closes the sheet, shows the info-requested banner', () => {
    const s = setup();

    s.outcomes.onInfoRequested('Envie uma foto');

    expect(s.current()).toMatchObject({
      status: 'INFO_REQUESTED',
      infoRequestMessage: 'Envie uma foto',
    });
    expect(s.setSheetState).toHaveBeenCalledWith(null);
    expect(s.setActionState).toHaveBeenCalledWith('info-requested');
  });

  it('cancels: moves to CANCELLED, closes the sheet, shows the cancelled banner', () => {
    const s = setup();

    s.outcomes.onCancelled();

    expect(s.current().status).toBe('CANCELLED');
    expect(s.setSheetState).toHaveBeenCalledWith(null);
    expect(s.setActionState).toHaveBeenCalledWith('cancelled');
  });
});
