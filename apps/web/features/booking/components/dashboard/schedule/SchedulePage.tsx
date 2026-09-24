'use client';

import type {
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { useTranslations } from 'next-intl';
import { WeekNav } from '@/shells/dashboard/components/WeekNav';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { toLocalDate } from '@/features/booking/schedule/schedule-timeline';
import { useSchedulePageController } from '@/features/booking/schedule/useSchedulePageController';
import { useTenant } from '@/providers/tenant-provider';
import { ClosureFormSheet } from './ClosureFormSheet';
import { OpeningFormSheet } from './OpeningFormSheet';
import { RemoveClosureDialog } from './RemoveClosureDialog';
import { RemoveOpeningDialog } from './RemoveOpeningDialog';
import { ResourceFilterMenu } from './ResourceFilterMenu';
import { ScheduleDayHeader } from './ScheduleDayHeader';
import { ScheduleMainView } from './ScheduleMainView';
import { ScheduleStatusFilterMenu } from './ScheduleStatusFilterMenu';

interface SchedulePageProps {
  readonly initialClosures: ScheduleClosureListResponse;
  readonly initialOpenings: ScheduleOpeningListResponse;
  readonly initialBookings: StaffBookingListResponse;
  readonly businessHours: TenantBusinessHours;
  readonly todayKey: string;
  readonly weekStartKey: string;
  readonly initialSelectedDateKey?: string;
  readonly slotGranularityMinutes: 15 | 30 | 60;
}

export function SchedulePage(props: SchedulePageProps): React.JSX.Element {
  const {
    ui,
    businessHours,
    todayKey,
    slotGranularityMinutes,
    timezone,
    statusLabels,
    scheduleViewMode,
    setPersistedViewMode,
    weekDayInfo,
    activeDates,
    dimmedDates,
    selectedDayTimeline,
    weekTimelineCards,
    selectedDayLabel,
    timelineTitle,
    bookingEventCount,
    hasBookingInSelectedDay,
    slotLabels,
    scheduleReturnTo,
    weekNav,
    mutationHandlers,
    statusFilter,
    resourceFilter,
    scheduleFetchError,
    resourceNameById,
    bookingsItems,
    visibleClosures,
    visibleOpenings,
  } = useSchedulePageController(props);
  const { role } = useTenant();
  const t = useTranslations('dashboard.schedule');
  const locale = useResolvedLocale();

  const isWeekView = scheduleViewMode === 'week';
  // Bounded multi-resource columns (M22-S06) — MANAGER-only, driven entirely by the same
  // ResourceFilterMenu checkboxes; zero checked keeps today's exact single-timeline behavior.
  const showResourceColumns = role === 'MANAGER' && resourceFilter.selectedResourceIdSet.size > 0;

  return (
    <div className="space-y-4 px-4 pb-8">
      {scheduleFetchError ? (
        <p
          data-testid="schedule-fetch-error"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
        >
          {t('fetchError')}: {resolveErrorMessageFromApiError(scheduleFetchError, locale)}
        </p>
      ) : null}

      <WeekNav
        windowStart={toLocalDate(ui.weekStartKey)}
        windowDays={7}
        today={toLocalDate(todayKey)}
        onPrev={weekNav.handlePrevWeek}
        onNext={weekNav.handleNextWeek}
        selectedDate={ui.selectedDateKey}
        onSelectDate={weekNav.handleSelectDate}
        activeDates={activeDates}
        dimmedDates={dimmedDates}
      />

      <ScheduleDayHeader
        selectedDayLabel={selectedDayLabel}
        scheduleViewMode={scheduleViewMode}
        onViewModeChange={setPersistedViewMode}
        onGoToToday={weekNav.handleGoToToday}
        selectedDayClosed={selectedDayTimeline.selectedDayClosed}
        onOpenSpecialDay={() => {
          ui.setClosureWarning(null);
          ui.setOpeningSheetOpen(true);
          ui.setClosureSheetOpen(false);
        }}
        onBlockPeriod={() => {
          ui.setClosureWarning(null);
          ui.setClosureSheetOpen(true);
          ui.setOpeningSheetOpen(false);
        }}
        closureWarning={ui.closureWarning}
        hasBookingInSelectedDay={hasBookingInSelectedDay}
        bookingCount={bookingEventCount}
      />

      <ScheduleMainView
        isWeekView={isWeekView}
        showResourceColumns={showResourceColumns}
        weekDayInfo={weekDayInfo}
        weekTimelineCards={weekTimelineCards}
        selectedDateKey={ui.selectedDateKey}
        todayKey={todayKey}
        onSelectDate={weekNav.handleSelectDate}
        slotGranularityMinutes={slotGranularityMinutes}
        statusLabels={statusLabels}
        timezone={timezone}
        scheduleReturnTo={scheduleReturnTo}
        onOpeningClick={ui.setRemoveOpeningTarget}
        onClosureClick={ui.setRemoveClosureTarget}
        selectedResourceIdSet={resourceFilter.selectedResourceIdSet}
        resourceNameById={resourceNameById}
        bookingsItems={bookingsItems}
        selectedStatusSet={statusFilter.selectedStatusSet}
        visibleClosures={visibleClosures}
        visibleOpenings={visibleOpenings}
        businessHours={businessHours}
        selectedDayTimeline={selectedDayTimeline}
        slotLabels={slotLabels}
        timelineTitle={timelineTitle}
      />

      <ScheduleStatusFilterMenu
        containerRef={ui.statusFilterRef}
        open={ui.statusFilterOpen}
        onToggleOpen={statusFilter.handleToggleStatusFilterOpen}
        selectedStatusSet={statusFilter.selectedStatusSet}
        statusLabels={statusLabels}
        onToggleStatus={statusFilter.handleToggleStatus}
        onReset={statusFilter.handleResetStatusFilter}
        onClose={statusFilter.handleCloseStatusFilter}
      />

      {role === 'MANAGER' && (
        <ResourceFilterMenu
          containerRef={ui.resourceFilterRef}
          open={ui.resourceFilterOpen}
          onToggleOpen={resourceFilter.handleToggleResourceFilterOpen}
          selectedResourceIdSet={resourceFilter.selectedResourceIdSet}
          onToggleResource={resourceFilter.handleToggleResource}
          onReset={resourceFilter.handleResetResourceFilter}
          onClose={resourceFilter.handleCloseResourceFilter}
        />
      )}

      <ClosureFormSheet
        key={`closure-${ui.closureSheetOpen}-${ui.selectedDateKey}`}
        open={ui.closureSheetOpen}
        initialDate={ui.selectedDateKey}
        todayKey={todayKey}
        timezone={businessHours.timezone}
        slotGranularityMinutes={slotGranularityMinutes}
        onClose={() => ui.setClosureSheetOpen(false)}
        onSubmit={mutationHandlers.handleCreateClosure}
      />

      <OpeningFormSheet
        key={`opening-${ui.openingSheetOpen}-${ui.selectedDateKey}`}
        open={ui.openingSheetOpen}
        initialDate={ui.selectedDateKey}
        todayKey={todayKey}
        timezone={businessHours.timezone}
        slotGranularityMinutes={slotGranularityMinutes}
        onClose={() => ui.setOpeningSheetOpen(false)}
        onSubmit={mutationHandlers.handleCreateOpening}
      />

      <RemoveClosureDialog
        open={ui.removeClosureTarget !== null}
        target={ui.removeClosureTarget}
        onClose={() => ui.setRemoveClosureTarget(null)}
        onSubmit={mutationHandlers.handleRemoveClosure}
        resourceNameById={resourceNameById}
      />

      <RemoveOpeningDialog
        open={ui.removeOpeningTarget !== null}
        target={ui.removeOpeningTarget}
        onClose={() => ui.setRemoveOpeningTarget(null)}
        onSubmit={mutationHandlers.handleRemoveOpening}
        resourceNameById={resourceNameById}
      />
    </div>
  );
}
