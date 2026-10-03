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
import { findPick } from '@/features/booking/model/resource-picks';
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
  const { formatMoney } = useFormatting();
  const unitRequirements = requirements.filter(
    (req) => req.serviceId === unit.serviceId && (req.legIndex ?? null) === unit.legIndex,
  );
  const [first] = unitRequirements;
  const isLeg = unit.legName !== null && unit.legIndex !== null;
  const heading = isLeg
    ? (unit.legName ?? '')
    : unitRequirements.length === 1 && first
      ? t(`headingSingle.${first.resourceType}`)
      : t('headingMulti');
  const legTotal = service.legs?.length ?? 0;
  const subtitle = isLeg
    ? `${service.name} · ${t('legSubtitle', { index: (unit.legIndex ?? 0) + 1, total: legTotal })}`
    : undefined;
  const summaryLine = isLeg
    ? undefined
    : t('serviceLine', {
        name: service.name,
        price: formatMoney(service.price.amount),
        duration: formatDuration(service.durationMinutes),
      });
  const allPicked =
    unitRequirements.length > 0 &&
    unitRequirements.every((req) => findPick(picks, req) !== undefined);

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
