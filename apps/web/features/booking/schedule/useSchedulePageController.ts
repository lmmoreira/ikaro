'use client';

import { useTranslations } from 'next-intl';
import { buildBookingStatusLabels } from '@/features/booking/model/booking-status';
import {
  useCreateClosure,
  useCreateOpening,
  useRemoveClosure,
  useRemoveOpening,
} from '@/features/booking/schedule/useSchedule';
import { useScheduleCoreData } from '@/features/booking/schedule/schedule-page-core-data';
import {
  buildControllerResult,
  useScheduleLabels,
  type UseSchedulePageControllerResult,
} from '@/features/booking/schedule/schedule-page-controller-result';

import type { SchedulePageControllerInput } from '@/features/booking/schedule/schedule-page-controller-types';

export type { SchedulePageControllerInput } from '@/features/booking/schedule/schedule-page-controller-types';

// Extracted from SchedulePage (TD37-S5A) — the top-level controller composing the page's UI
// state, week data, derived timeline, labels, and every interaction/mutation handler into the
// single object the (purely presentational) page component renders from.
export function useSchedulePageController(
  props: SchedulePageControllerInput,
): UseSchedulePageControllerResult {
  const t = useTranslations('dashboard.schedule');
  const bookingCardT = useTranslations('dashboard.bookingCard');
  const statusLabels = buildBookingStatusLabels(bookingCardT);

  const createClosureMutation = useCreateClosure();
  const createOpeningMutation = useCreateOpening();
  const removeClosureMutation = useRemoveClosure();
  const removeOpeningMutation = useRemoveOpening();

  const core = useScheduleCoreData(props);
  const labels = useScheduleLabels(core, props.slotGranularityMinutes);

  return buildControllerResult(
    props,
    core,
    labels,
    t,
    { createClosureMutation, createOpeningMutation, removeClosureMutation, removeOpeningMutation },
    statusLabels,
  );
}
