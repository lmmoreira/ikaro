import { describe, expect, it, vi } from 'vitest';
import { BOOKING_STATUS } from '@ikaro/types';
import type {
  CreateClosureRequest,
  CreateOpeningRequest,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import type { ScheduleUiState } from './schedule-page-ui-state';
import { buildScheduleMutationHandlers } from './schedule-page-mutation-handlers';

function makeUi(overrides: Partial<ScheduleUiState> = {}): ScheduleUiState {
  return {
    weekStartKey: '2026-08-17',
    setWeekStartKey: vi.fn(),
    selectedDateKey: '2026-08-17',
    setSelectedDateKey: vi.fn(),
    closureSheetOpen: true,
    setClosureSheetOpen: vi.fn(),
    openingSheetOpen: true,
    setOpeningSheetOpen: vi.fn(),
    closureWarning: null,
    setClosureWarning: vi.fn(),
    removeClosureTarget: { id: 'closure-1' } as never,
    setRemoveClosureTarget: vi.fn(),
    removeOpeningTarget: { id: 'opening-1' } as never,
    setRemoveOpeningTarget: vi.fn(),
    statusFilterOpen: false,
    setStatusFilterOpen: vi.fn(),
    statusFilterRef: { current: null },
    ...overrides,
  };
}

function makeBusinessHours(): TenantBusinessHours {
  return {
    timezone: 'America/Sao_Paulo',
    monday: { open: '09:00', close: '18:00' },
    tuesday: null,
    wednesday: null,
    thursday: null,
    friday: null,
    saturday: null,
    sunday: null,
  };
}

function makeBooking(overrides: Partial<StaffBookingCardResponse> = {}): StaffBookingCardResponse {
  return {
    bookingId: 'booking-1',
    status: BOOKING_STATUS.APPROVED,
    scheduledAt: '2026-08-17T12:00:00.000Z',
    contactName: 'João Silva',
    serviceNames: ['Lavagem completa'],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 30,
    isCustomer: false,
    ...overrides,
  };
}

const t = ((key: string, values?: { count: number }) =>
  key === 'closureWarning' ? `${values?.count} agendamento(s) afetado(s)` : key) as never;

describe('buildScheduleMutationHandlers', () => {
  it('handleCreateClosure syncs the week/date, closes the sheet, and sets a warning when bookings overlap', async () => {
    const ui = makeUi();
    const overlappingBooking = makeBooking({ scheduledAt: '2026-08-17T12:00:00.000Z' }); // 09:00 local
    const created = { id: 'new-closure' } as never;
    const createClosureMutation = { mutateAsync: vi.fn().mockResolvedValue(created) };
    const handlers = buildScheduleMutationHandlers({
      ui,
      businessHours: makeBusinessHours(),
      timezone: 'America/Sao_Paulo',
      visibleBookings: [overlappingBooking],
      t,
      createClosureMutation,
      createOpeningMutation: { mutateAsync: vi.fn() },
      removeClosureMutation: { mutateAsync: vi.fn() },
      removeOpeningMutation: { mutateAsync: vi.fn() },
    });

    const body: CreateClosureRequest = {
      date: '2026-08-17',
      reason: 'MAINTENANCE',
      startTime: '09:00',
      endTime: '10:00',
    };
    const result = await handlers.handleCreateClosure(body);

    expect(result).toBe(created);
    expect(createClosureMutation.mutateAsync).toHaveBeenCalledWith(body);
    expect(ui.setWeekStartKey).toHaveBeenCalledWith('2026-08-17');
    expect(ui.setSelectedDateKey).toHaveBeenCalledWith('2026-08-17');
    expect(ui.setClosureWarning).toHaveBeenCalledWith('1 agendamento(s) afetado(s)');
    expect(ui.setClosureSheetOpen).toHaveBeenCalledWith(false);
  });

  it('handleCreateClosure clears the warning when no booking overlaps', async () => {
    const ui = makeUi();
    const createClosureMutation = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const handlers = buildScheduleMutationHandlers({
      ui,
      businessHours: makeBusinessHours(),
      timezone: 'America/Sao_Paulo',
      visibleBookings: [],
      t,
      createClosureMutation,
      createOpeningMutation: { mutateAsync: vi.fn() },
      removeClosureMutation: { mutateAsync: vi.fn() },
      removeOpeningMutation: { mutateAsync: vi.fn() },
    });

    await handlers.handleCreateClosure({ date: '2026-08-17', reason: 'MAINTENANCE' });
    expect(ui.setClosureWarning).toHaveBeenCalledWith(null);
  });

  it('handleCreateOpening syncs the week/date and closes the sheet', async () => {
    const ui = makeUi();
    const created = { id: 'new-opening' } as never;
    const createOpeningMutation = { mutateAsync: vi.fn().mockResolvedValue(created) };
    const handlers = buildScheduleMutationHandlers({
      ui,
      businessHours: makeBusinessHours(),
      timezone: 'America/Sao_Paulo',
      visibleBookings: [],
      t,
      createClosureMutation: { mutateAsync: vi.fn() },
      createOpeningMutation,
      removeClosureMutation: { mutateAsync: vi.fn() },
      removeOpeningMutation: { mutateAsync: vi.fn() },
    });

    const body: CreateOpeningRequest = { date: '2026-08-18', startTime: '10:00', endTime: '12:00' };
    const result = await handlers.handleCreateOpening(body);

    expect(result).toBe(created);
    expect(createOpeningMutation.mutateAsync).toHaveBeenCalledWith(body);
    expect(ui.setWeekStartKey).toHaveBeenCalledWith('2026-08-17');
    expect(ui.setSelectedDateKey).toHaveBeenCalledWith('2026-08-18');
    expect(ui.setOpeningSheetOpen).toHaveBeenCalledWith(false);
  });

  it('handleRemoveClosure clears the remove-closure target on success', async () => {
    const ui = makeUi();
    const removeClosureMutation = { mutateAsync: vi.fn().mockResolvedValue(undefined) };
    const handlers = buildScheduleMutationHandlers({
      ui,
      businessHours: makeBusinessHours(),
      timezone: 'America/Sao_Paulo',
      visibleBookings: [],
      t,
      createClosureMutation: { mutateAsync: vi.fn() },
      createOpeningMutation: { mutateAsync: vi.fn() },
      removeClosureMutation,
      removeOpeningMutation: { mutateAsync: vi.fn() },
    });

    await handlers.handleRemoveClosure('closure-1');
    expect(removeClosureMutation.mutateAsync).toHaveBeenCalledWith('closure-1');
    expect(ui.setRemoveClosureTarget).toHaveBeenCalledWith(null);
  });

  it('handleRemoveOpening clears the remove-opening target on success', async () => {
    const ui = makeUi();
    const removeOpeningMutation = { mutateAsync: vi.fn().mockResolvedValue(undefined) };
    const handlers = buildScheduleMutationHandlers({
      ui,
      businessHours: makeBusinessHours(),
      timezone: 'America/Sao_Paulo',
      visibleBookings: [],
      t,
      createClosureMutation: { mutateAsync: vi.fn() },
      createOpeningMutation: { mutateAsync: vi.fn() },
      removeClosureMutation: { mutateAsync: vi.fn() },
      removeOpeningMutation,
    });

    await handlers.handleRemoveOpening('opening-1');
    expect(removeOpeningMutation.mutateAsync).toHaveBeenCalledWith('opening-1');
    expect(ui.setRemoveOpeningTarget).toHaveBeenCalledWith(null);
  });
});
