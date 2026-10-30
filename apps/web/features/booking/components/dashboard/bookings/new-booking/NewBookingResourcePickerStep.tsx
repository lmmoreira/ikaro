'use client';

import { useTranslations } from 'next-intl';
import type {
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
} from '@ikaro/types';
import type { PickerUnit } from '@/features/booking/model/booking-steps';
import {
  describePickerUnit,
  pickHintOf,
  resourceInitials,
} from '@/features/booking/model/resource-picker-copy';
import { findPick } from '@/features/booking/model/resource-picks';
import { NewBookingStepLayout } from './NewBookingStepLayout';
import { SECTION_LABEL_CLASS } from './new-booking-styles';
import { FeedbackMessage } from '@/shared/components/ui/feedback-message';

type PickerStatus = 'loading' | 'error' | 'ready';

interface NewBookingResourcePickerStepProps {
  readonly unit: PickerUnit;
  readonly service: HotsiteServiceResponse;
  readonly requirements: readonly HotsiteServiceResourceOptionsRequirement[];
  readonly picks: readonly ResourceSelectionItem[];
  readonly status: PickerStatus;
  readonly reselectMessage: string | null;
  readonly onPick: (
    requirement: HotsiteServiceResourceOptionsRequirement,
    resourceId: string,
  ) => void;
  readonly onRetry: () => void;
  readonly summary: React.ReactNode;
  readonly onBack: () => void;
  readonly onNext: () => void;
}

function PickerSection({
  requirement,
  pickedId,
  onPick,
}: {
  readonly requirement: HotsiteServiceResourceOptionsRequirement;
  readonly pickedId: string | undefined;
  readonly onPick: (resourceId: string) => void;
}): React.JSX.Element {
  const t = useTranslations('booking.resourcePicker');
  const groupName = `pick-${requirement.serviceId}-${requirement.legIndex ?? 'flat'}-${requirement.resourceType}`;
  return (
    <fieldset data-testid="picker-section" data-resource-type={requirement.resourceType}>
      <legend className={SECTION_LABEL_CLASS}>
        {t(`sectionTitle.${requirement.resourceType}`)}
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {requirement.options.map((option) => {
          const checked = pickedId === option.resourceId;
          return (
            <label
              key={option.resourceId}
              data-testid="picker-option"
              data-resource-id={option.resourceId}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 focus-within:ring-2 focus-within:ring-blue-200 ${
                checked
                  ? 'border-blue-500 bg-blue-50/60'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name={groupName}
                className="sr-only"
                checked={checked}
                onChange={() => onPick(option.resourceId)}
              />
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700"
              >
                {resourceInitials(option.name)}
              </span>
              <span className="text-sm font-semibold text-gray-900">{option.name}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// One picker step per unit — a section per CUSTOMER_CHOICE requirement of a flat service or bundle,
// a step per leg for a legged one — with the same headings, hints and gate as the hotsite's
// (describePickerUnit); nothing is ever pre-selected.
export function NewBookingResourcePickerStep({
  unit,
  service,
  requirements,
  picks,
  status,
  reselectMessage,
  onPick,
  onRetry,
  summary,
  onBack,
  onNext,
}: NewBookingResourcePickerStepProps): React.JSX.Element {
  const t = useTranslations('booking.resourcePicker');
  const tn = useTranslations('dashboard.newBooking.steps');
  const description = describePickerUnit(unit, service, requirements, picks);
  const { heading, leg } = description;
  let title = t('headingMulti');
  if (heading.kind === 'leg') title = heading.name;
  else if (heading.kind === 'single') title = t(`headingSingle.${heading.resourceType}`);
  const hint = pickHintOf(description.requirements);

  return (
    <NewBookingStepLayout
      summary={summary}
      onBack={onBack}
      onNext={onNext}
      nextDisabled={!description.allPicked || status !== 'ready'}
    >
      <div data-testid="step-resource-picker" data-unit={unit.key}>
        <h2 className="text-xl font-bold text-gray-900" data-testid="picker-heading">
          {title}
        </h2>
        {leg && (
          <p className="mt-1 text-sm text-gray-600">
            {service.name} · {t('legSubtitle', { index: leg.index, total: leg.total })}
          </p>
        )}
      </div>

      {reselectMessage && (
        <FeedbackMessage
          focusOnMount
          testId="picker-reselect-error"
          title={reselectMessage}
          hint={t('reselectHint')}
        />
      )}
      {status === 'loading' && (
        <output className="block text-sm text-gray-600" aria-busy="true">
          {t('loading')}
        </output>
      )}
      {status === 'error' && (
        <FeedbackMessage
          testId="picker-load-error"
          title={t('loadError')}
          hint={t('loadErrorHint')}
          onRetry={onRetry}
          retryLabel={tn('retry')}
        />
      )}
      {status === 'ready' && (
        <>
          {description.requirements.map((requirement) => (
            <PickerSection
              key={`${requirement.serviceId}:${requirement.legIndex ?? '-'}:${requirement.resourceType}`}
              requirement={requirement}
              pickedId={findPick(picks, requirement)}
              onPick={(resourceId) => onPick(requirement, resourceId)}
            />
          ))}
          {!description.allPicked && (
            <p className="text-sm text-gray-600" data-testid="picker-hint">
              {hint.scope === 'single'
                ? t(`pickHintSingle.${hint.resourceType}`)
                : t('pickHintMulti')}
            </p>
          )}
        </>
      )}
    </NewBookingStepLayout>
  );
}
