'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type {
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import type { PickerUnit } from '@/features/booking/model/booking-steps';
import { describePickerUnit } from '@/features/booking/model/resource-picker-copy';
import { summarizeSelection } from '@/features/booking/model/selection-totals';
import { ResourcePicker, type ResourcePickerStatus } from './ResourcePicker';

interface ResourcePickerStepProps {
  readonly unit: PickerUnit;
  readonly service: HotsiteServiceResponse;
  readonly requirements: readonly HotsiteServiceResourceOptionsRequirement[];
  readonly picks: readonly ResourceSelectionItem[];
  readonly status: ResourcePickerStatus;
  readonly reselectMessage: string | null;
  readonly onPick: (
    requirement: HotsiteServiceResourceOptionsRequirement,
    resourceId: string,
  ) => void;
  readonly onRetry: () => void;
  readonly onBack: () => void;
  readonly onNext: () => void;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

// One picker step per unit: a flat service (or bundle) is one step with a section per
// CUSTOMER_CHOICE requirement; a legged service gets a step per leg that has a choice, headed
// with the leg name. The page's "Passo N de M" stays the only step counter.
export function ResourcePickerStep({
  unit,
  service,
  requirements,
  picks,
  status,
  reselectMessage,
  onPick,
  onRetry,
  onBack,
  onNext,
}: ResourcePickerStepProps): React.JSX.Element {
  const t = useTranslations('booking.resourcePicker');
  const tc = useTranslations('common');
  const tb = useTranslations('booking');
  const { formatMoney } = useFormatting();
  const {
    requirements: unitRequirements,
    heading: unitHeading,
    leg,
    allPicked,
  } = describePickerUnit(unit, service, requirements, picks);
  let heading = t('headingMulti');
  if (unitHeading.kind === 'leg') heading = unitHeading.name;
  else if (unitHeading.kind === 'single') heading = t(`headingSingle.${unitHeading.resourceType}`);
  const subtitle = leg
    ? `${service.name} · ${t('legSubtitle', { index: leg.index, total: leg.total })}`
    : undefined;
  const totals = summarizeSelection([service]);
  const summaryLine = leg
    ? undefined
    : t('serviceLine', {
        name: service.name,
        price: totals.isFloor
          ? tb('summary.fromAmount', { amount: formatMoney(totals.amount) })
          : formatMoney(totals.amount),
        duration: totals.isFloor
          ? tb('summary.durationToChoose')
          : formatDuration(totals.durationMinutes),
      });
  return (
    <div data-testid="step-resource-picker" data-unit={unit.key}>
      <ResourcePicker
        heading={heading}
        subtitle={subtitle}
        summaryLine={summaryLine}
        status={status}
        requirements={unitRequirements}
        picks={picks}
        onPick={onPick}
        onRetry={onRetry}
        reselectMessage={reselectMessage}
      />
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer border px-6 py-3"
          style={{
            borderRadius: 'var(--ba-radius)',
            borderColor: 'var(--ba-secondary)',
            color: 'var(--ba-text)',
          }}
        >
          {tc('back')}
        </button>
        <button
          type="button"
          disabled={!allPicked || status !== 'ready'}
          onClick={onNext}
          data-testid="step-next"
          style={btnStyle}
          className="cursor-pointer border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {tc('next')}
        </button>
      </div>
    </div>
  );
}
