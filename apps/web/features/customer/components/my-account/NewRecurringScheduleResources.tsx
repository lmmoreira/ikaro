'use client';

import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type {
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
} from '@ikaro/types';
import {
  choiceRequirements,
  isBundleForm,
  isChoiceLine,
  optionsForChoice,
  visibleRequirementLines,
} from '@/features/booking/model/recurring-requirements';
import type { RecurringScheduleDraft } from '@/features/booking/model/recurring-schedule-form';
import { useRecurringResourceOptions } from '../../hooks/useRecurringResourceOptions';
import { AutoResourceLine, ResourceField } from './NewRecurringScheduleServiceFields';
import { useRequirementText } from './use-requirement-text';

interface ResourcePicksInput {
  readonly service: HotsiteServiceResponse | null;
  readonly tenantSlug: string;
  readonly draft: RecurringScheduleDraft;
  readonly onChange: (patch: Partial<RecurringScheduleDraft>) => void;
}

export interface ResourcePicks {
  readonly query: ReturnType<typeof useRecurringResourceOptions>;
  readonly options: readonly HotsiteServiceResourceOptionsRequirement[] | undefined;
  /** A group is loading, failed or has nothing to offer: the pattern cannot be reviewed yet. */
  readonly blocked: boolean;
}

/**
 * The options of every customer-chosen requirement of the selected service, and the preselection:
 * the prototype picks the first option of every group, so a customer with no preference never faces
 * an unselected list, and a pick that is no longer offered (deactivated since a renewal's schedule
 * was made) is replaced the same way.
 */
export function useResourcePicks({
  service,
  tenantSlug,
  draft,
  onChange,
}: ResourcePicksInput): ResourcePicks {
  const choices = useMemo(() => (service === null ? [] : choiceRequirements(service)), [service]);
  const query = useRecurringResourceOptions(tenantSlug, draft.serviceId, choices.length > 0);
  const options = query.data;

  useEffect(() => {
    if (options === undefined || choices.length === 0) return;
    const next = choices.map((line) => {
      const offered = optionsForChoice(options, line);
      const current = draft.resourceIds[line.choiceIndex] ?? null;
      if (current !== null && offered.some((option) => option.resourceId === current)) {
        return current;
      }
      return offered[0]?.resourceId ?? null;
    });
    if (next.some((resourceId, index) => resourceId !== (draft.resourceIds[index] ?? null))) {
      onChange({ resourceIds: next });
    }
  }, [choices, options, draft.resourceIds, onChange]);

  const hasEmptyGroup =
    options !== undefined && choices.some((line) => optionsForChoice(options, line).length === 0);
  const blocked = choices.length > 0 && (query.isPending || query.isError || hasEmptyGroup);
  return { query, options, blocked };
}

interface ResourceFieldsProps {
  readonly service: HotsiteServiceResponse;
  readonly draft: RecurringScheduleDraft;
  readonly picks: ResourcePicks;
  /** Show the missing-pick message under a group that has none. */
  readonly showRequired: boolean;
  readonly onChange: (patch: Partial<RecurringScheduleDraft>) => void;
}

/**
 * One pick group per `CUSTOMER_CHOICE` requirement and, inside a bundle, a read-only line for each
 * requirement the system resolves every week. A service with a single requirement keeps the plain
 * "Recurso" field, or nothing at all when that requirement is automatic.
 */
export function ResourceFields({
  service,
  draft,
  picks,
  showRequired,
  onChange,
}: ResourceFieldsProps): React.JSX.Element {
  const tn = useTranslations('customer.recurringSchedules.new');
  const text = useRequirementText();
  const bundle = isBundleForm(service);
  const choices = choiceRequirements(service);

  return (
    <>
      {visibleRequirementLines(service).map((line) => {
        if (!isChoiceLine(line)) {
          return bundle ? (
            <AutoResourceLine
              key={`auto-${line.type}`}
              title={text.bundleTitle(line)}
              text={text.autoLine(line)}
            />
          ) : null;
        }
        const picked = draft.resourceIds[line.choiceIndex] ?? null;
        return (
          <ResourceField
            key={`choice-${line.type}`}
            query={picks.query}
            title={bundle ? text.bundleTitle(line) : text.singleTitle()}
            options={picks.options === undefined ? [] : optionsForChoice(picks.options, line)}
            resourceId={picked}
            required={showRequired && picked === null}
            requiredMessage={
              bundle ? text.bundleRequiredMessage(line) : text.singleRequiredMessage()
            }
            noOptionsMessage={text.noOptionsMessage(line)}
            index={line.choiceIndex}
            onChange={(resourceId) =>
              onChange({
                resourceIds: choices.map((choice) =>
                  choice.choiceIndex === line.choiceIndex
                    ? resourceId
                    : (draft.resourceIds[choice.choiceIndex] ?? null),
                ),
              })
            }
          />
        );
      })}
      {bundle && <p className="-mt-3 text-xs text-gray-500">{tn('bundleHint')}</p>}
    </>
  );
}
