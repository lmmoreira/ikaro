import type { useTranslations } from 'next-intl';
import type {
  CreateClosureRequest,
  CreateOpeningRequest,
  ScheduleClosure,
  ScheduleOpening,
  StaffBookingCardResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { getDayHoursForDate, getWeekStartKey } from '@/features/booking/schedule/date-utils';
import { countOverlappingBookings } from '@/features/booking/schedule/schedule-page-derived';
import {
  syncWeekAndDate,
  type ScheduleUiState,
} from '@/features/booking/schedule/schedule-page-ui-state';

interface ScheduleMutationHandlersInput {
  readonly ui: ScheduleUiState;
  readonly businessHours: TenantBusinessHours;
  readonly timezone: string;
  readonly visibleBookings: readonly StaffBookingCardResponse[];
  readonly t: ReturnType<typeof useTranslations>;
  readonly createClosureMutation: {
    mutateAsync: (body: CreateClosureRequest) => Promise<ScheduleClosure>;
  };
  readonly createOpeningMutation: {
    mutateAsync: (body: CreateOpeningRequest) => Promise<ScheduleOpening>;
  };
  readonly removeClosureMutation: { mutateAsync: (id: string) => Promise<void> };
  readonly removeOpeningMutation: { mutateAsync: (id: string) => Promise<void> };
}

// Extracted from SchedulePage (TD37-S5A) — the closure/opening create+remove handlers all share
// the same UI-state sync pattern and are a cohesive, self-contained unit.
export function buildScheduleMutationHandlers({
  ui,
  businessHours,
  timezone,
  visibleBookings,
  t,
  createClosureMutation,
  createOpeningMutation,
  removeClosureMutation,
  removeOpeningMutation,
}: ScheduleMutationHandlersInput) {
  async function handleCreateClosure(body: CreateClosureRequest): Promise<ScheduleClosure> {
    const dayHours = getDayHoursForDate(body.date, businessHours);
    const created = await createClosureMutation.mutateAsync(body);
    const overlapCount = countOverlappingBookings(visibleBookings, timezone, body, dayHours);

    syncWeekAndDate(ui, getWeekStartKey(body.date), body.date);
    ui.setClosureWarning(overlapCount > 0 ? t('closureWarning', { count: overlapCount }) : null);
    ui.setClosureSheetOpen(false);
    return created;
  }

  async function handleCreateOpening(body: CreateOpeningRequest): Promise<ScheduleOpening> {
    const created = await createOpeningMutation.mutateAsync(body);
    syncWeekAndDate(ui, getWeekStartKey(body.date), body.date);
    ui.setOpeningSheetOpen(false);
    return created;
  }

  async function handleRemoveClosure(id: string): Promise<void> {
    await removeClosureMutation.mutateAsync(id);
    ui.setRemoveClosureTarget(null);
  }

  async function handleRemoveOpening(id: string): Promise<void> {
    await removeOpeningMutation.mutateAsync(id);
    ui.setRemoveOpeningTarget(null);
  }

  return { handleCreateClosure, handleCreateOpening, handleRemoveClosure, handleRemoveOpening };
}
