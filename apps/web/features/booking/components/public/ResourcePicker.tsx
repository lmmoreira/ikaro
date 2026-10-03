'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type {
  HotsiteServiceResourceOptionsRequirement,
  ResourceSelectionItem,
  ResourceType,
} from '@ikaro/types';
import { findPick } from '@/features/booking/model/resource-picks';
import { ErrorAlert } from './ErrorAlert';

export type ResourcePickerStatus = 'loading' | 'error' | 'ready';

interface ResourcePickerProps {
  readonly heading: string;
  readonly subtitle?: string;
  readonly summaryLine?: string;
  readonly status: ResourcePickerStatus;
  readonly requirements: readonly HotsiteServiceResourceOptionsRequirement[];
  readonly picks: readonly ResourceSelectionItem[];
  readonly onPick: (
    requirement: HotsiteServiceResourceOptionsRequirement,
    resourceId: string,
  ) => void;
  readonly onRetry: () => void;
  readonly reselectMessage: string | null;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

interface SectionProps {
  readonly requirement: HotsiteServiceResourceOptionsRequirement;
  readonly pickedId: string | undefined;
  readonly onPick: (resourceId: string) => void;
}

function PickerSection({ requirement, pickedId, onPick }: SectionProps): React.JSX.Element {
  const t = useTranslations('booking.resourcePicker');
  const groupName = `pick-${requirement.serviceId}-${requirement.legIndex ?? 'flat'}-${requirement.resourceType}`;
  return (
    <fieldset
      className="mt-5 border-0 p-0"
      data-testid="picker-section"
      data-resource-type={requirement.resourceType}
    >
      <legend className="mb-2 text-sm font-bold" style={{ color: 'var(--ba-text)' }}>
        {t(`sectionTitle.${requirement.resourceType}`)}
      </legend>
      <div className="flex flex-col gap-3">
        {requirement.options.map((option) => {
          const checked = pickedId === option.resourceId;
          return (
            <label
              key={option.resourceId}
              className="flex cursor-pointer items-center gap-3.5 border-2 p-3.5 focus-within:ring-2"
              style={{
                borderRadius: 'var(--ba-radius)',
                borderColor: checked ? 'var(--ba-primary)' : 'var(--ba-secondary)',
              }}
              data-testid="picker-option"
              data-resource-id={option.resourceId}
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
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-bold text-white"
                style={{ backgroundColor: 'var(--ba-primary)' }}
              >
                {initials(option.name)}
              </span>
              <span className="font-semibold" style={{ color: 'var(--ba-text)' }}>
                {option.name}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function pickHint(
  t: ReturnType<typeof useTranslations>,
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
): string {
  const types = new Set<ResourceType>(requirements.map((req) => req.resourceType));
  const [only] = [...types];
  return requirements.length === 1 && only ? t(`pickHintSingle.${only}`) : t('pickHintMulti');
}

// One generic picker for every resource type and service type: a section (radio group) per
// CUSTOMER_CHOICE requirement of the unit. Nothing is ever pre-selected. Automatic resources never
// reach it — the unit's requirements are CUSTOMER_CHOICE only.
export function ResourcePicker({
  heading,
  subtitle,
  summaryLine,
  status,
  requirements,
  picks,
  onPick,
  onRetry,
  reselectMessage,
}: ResourcePickerProps): React.JSX.Element {
  const t = useTranslations('booking.resourcePicker');
  const tb = useTranslations('booking');
  const allPicked = requirements.every((req) => findPick(picks, req) !== undefined);

  return (
    <div data-testid="resource-picker">
      <h2
        className="text-2xl font-bold"
        style={{ color: 'var(--ba-text)' }}
        data-testid="picker-heading"
      >
        {heading}
      </h2>
      {subtitle && (
        <p className="mt-1 text-sm opacity-70" data-testid="picker-subtitle">
          {subtitle}
        </p>
      )}
      {summaryLine && <p className="mt-1 text-sm opacity-75">{summaryLine}</p>}

      {reselectMessage && (
        <div className="mt-4" data-testid="picker-reselect-error">
          <ErrorAlert hint={t('reselectHint')} focusOnMount>
            {reselectMessage}
          </ErrorAlert>
        </div>
      )}

      {status === 'loading' && (
        <p className="mt-4" role="status" aria-busy="true" data-testid="picker-loading">
          {t('loading')}
        </p>
      )}

      {status === 'error' && (
        <div className="mt-4" data-testid="picker-load-error">
          <ErrorAlert
            hint={t('loadErrorHint')}
            onRetry={onRetry}
            retryLabel={tb('errors.tryAgain')}
          >
            {t('loadError')}
          </ErrorAlert>
        </div>
      )}

      {status === 'ready' && (
        <>
          {requirements.map((requirement) => (
            <PickerSection
              key={`${requirement.serviceId}:${requirement.legIndex ?? '-'}:${requirement.resourceType}`}
              requirement={requirement}
              pickedId={findPick(picks, requirement)}
              onPick={(resourceId) => onPick(requirement, resourceId)}
            />
          ))}
          {!allPicked && (
            <p className="mt-4 text-sm opacity-70" data-testid="picker-hint">
              {pickHint(t, requirements)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
