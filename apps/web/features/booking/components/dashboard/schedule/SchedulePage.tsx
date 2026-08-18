'use client';

import type {
  ScheduleClosureListResponse,
  ScheduleOpeningListResponse,
  StaffBookingListResponse,
  TenantBusinessHours,
} from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { Card } from '@/shared/components/ui/card';
import { cn } from '@/shared/utils/cn';
import { WeekNav } from '@/shells/dashboard/components/WeekNav';
import { toLocalDate } from '@/features/booking/schedule/schedule-timeline';
import { useSchedulePageController } from '@/features/booking/schedule/useSchedulePageController';
import { ClosureFormSheet } from './ClosureFormSheet';
import { OpeningFormSheet } from './OpeningFormSheet';
import { RemoveClosureDialog } from './RemoveClosureDialog';
import { RemoveOpeningDialog } from './RemoveOpeningDialog';
import { ScheduleDayHeader } from './ScheduleDayHeader';
import { ScheduleStatusFilterMenu } from './ScheduleStatusFilterMenu';
import { ScheduleTimelineBoard } from './ScheduleTimelineBoard';
import { ScheduleWeekView } from './ScheduleWeekView';

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
  } = useSchedulePageController(props);

  const isWeekView = scheduleViewMode === 'week';

  return (
    <div className="space-y-4 px-4 pb-8">
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

      {isWeekView ? (
        <ScheduleWeekView
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
        />
      ) : (
        <Card className="overflow-hidden" data-testid="schedule-mobile-view">
          <div className="p-4">
            <div className="mb-3 flex items-center justify-end gap-3">
              <Badge
                className={cn(
                  'border-0',
                  selectedDayTimeline.selectedOpening
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-gray-100 text-gray-700',
                )}
              >
                {timelineTitle}
              </Badge>
            </div>

            <ScheduleTimelineBoard
              timeline={selectedDayTimeline}
              compact={false}
              slotGranularityMinutes={slotGranularityMinutes}
              slotLabels={slotLabels}
              statusLabels={statusLabels}
              timezone={timezone}
              scheduleReturnTo={scheduleReturnTo}
              onOpeningClick={ui.setRemoveOpeningTarget}
              onClosureClick={ui.setRemoveClosureTarget}
            />
          </div>
        </Card>
      )}

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
      />

      <RemoveOpeningDialog
        open={ui.removeOpeningTarget !== null}
        target={ui.removeOpeningTarget}
        onClose={() => ui.setRemoveOpeningTarget(null)}
        onSubmit={mutationHandlers.handleRemoveOpening}
      />
    </div>
  );
}
