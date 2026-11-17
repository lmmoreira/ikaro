import { describe, expect, it } from 'vitest';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { resolveBookingDetailActions } from './booking-detail-actions';

const FUTURE = new Date(Date.now() + 24 * 3_600_000).toISOString();

const RESCHEDULE: NonNullable<CustomerBookingDetailResponse['reschedule']> = {
  eligibleUntil: FUTURE,
  serviceIds: ['s1'],
  resourceSelections: [],
  durationMinutes: null,
  window: { minAdvanceHours: 2, maxAdvanceDays: 30 },
  keptPicks: [],
};

function resolve(
  status: CustomerBookingDetailResponse['status'],
  overrides: Partial<
    Pick<
      CustomerBookingDetailResponse,
      'cancellableUntil' | 'reschedule' | 'infoRequestMessage' | 'infoResponseMessage'
    >
  > = {},
  options: { tenantOperational?: boolean; infoJustSubmitted?: boolean } = {},
) {
  return resolveBookingDetailActions({
    status,
    booking: {
      cancellableUntil: null,
      reschedule: null,
      infoRequestMessage: null,
      infoResponseMessage: null,
      ...overrides,
    },
    tenantOperational: options.tenantOperational ?? true,
    infoJustSubmitted: options.infoJustSubmitted ?? false,
  });
}

describe('resolveBookingDetailActions', () => {
  it('offers cancel and reschedule for an approved, eligible booking of an operational tenant', () => {
    const actions = resolve('APPROVED', { cancellableUntil: FUTURE, reschedule: RESCHEDULE });

    expect(actions).toMatchObject({
      showCancel: true,
      showRescheduleAction: true,
      hasSidebarAction: true,
      hasMobileNotes: true,
    });
  });

  it('keeps cancel but drops reschedule while the tenant is suspended', () => {
    const actions = resolve(
      'APPROVED',
      { cancellableUntil: FUTURE, reschedule: RESCHEDULE },
      { tenantOperational: false },
    );

    expect(actions.showCancel).toBe(true);
    expect(actions.showRescheduleAction).toBe(false);
    expect(actions.hasSidebarAction).toBe(true);
  });

  it('offers the information form for an operational tenant and never while suspended', () => {
    const booking = { infoRequestMessage: 'Pode confirmar?', infoResponseMessage: null };

    expect(resolve('INFO_REQUESTED', booking).showInfoFields).toBe(true);
    expect(resolve('INFO_REQUESTED', booking, { tenantOperational: false }).showInfoFields).toBe(
      false,
    );
  });

  it('hides the information form once a response was just sent or already exists', () => {
    const booking = { infoRequestMessage: 'Pode confirmar?', infoResponseMessage: null };

    expect(resolve('INFO_REQUESTED', booking, { infoJustSubmitted: true }).showInfoFields).toBe(
      false,
    );
    expect(
      resolve('INFO_REQUESTED', { ...booking, infoResponseMessage: 'Sim' }).showInfoFields,
    ).toBe(false);
  });

  it('still lets the customer cancel an info-requested request while suspended', () => {
    const actions = resolve(
      'INFO_REQUESTED',
      { infoRequestMessage: 'Pode confirmar?' },
      { tenantOperational: false },
    );

    expect(actions.showCancel).toBe(true);
    expect(actions.hasSidebarAction).toBe(true);
  });

  it.each([
    ['COMPLETED', 'completedNote'],
    ['NO_SHOW', 'noShowNote'],
    ['CANCELLED', 'cancelledNote'],
    ['REJECTED', 'rejectedNote'],
  ] as const)('gives a %s booking its closed note and a sidebar pane', (status, note) => {
    const actions = resolve(status);

    expect(actions.closedNote).toBe(note);
    expect(actions.hasSidebarAction).toBe(true);
    expect(actions.showCancel).toBe(false);
  });

  it('has no sidebar action for an approved booking outside its cancellation window', () => {
    const actions = resolve('APPROVED');

    expect(actions.hasSidebarAction).toBe(false);
    expect(actions.hasMobileNotes).toBe(false);
  });
});
