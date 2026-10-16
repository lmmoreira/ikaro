import type {
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
} from '@ikaro/types';
import {
  isBundleForm,
  isChoiceLine,
  optionsForChoice,
  visibleRequirementLines,
} from '@/features/booking/model/recurring-requirements';
import type { RecurringScheduleDraft } from '@/features/booking/model/recurring-schedule-form';
import type { useRequirementText } from './use-requirement-text';

export interface ResourceRecapRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

/**
 * The resource rows of a recurring reservation's recap (the customer's review step, the staff's
 * result): a picked resource by name, an automatic requirement as "chosen every week" (listed only
 * in a bundle — a lone automatic requirement never had a row on the form). A plain function, not a
 * hook: the customer page calls it after its "no service" early return, so the caller passes the
 * wording it already read with `useRequirementText()`.
 */
export function buildResourceRecap(
  service: HotsiteServiceResponse,
  draft: RecurringScheduleDraft,
  options: readonly HotsiteServiceResourceOptionsRequirement[] | undefined,
  text: ReturnType<typeof useRequirementText>,
): readonly ResourceRecapRow[] {
  const bundle = isBundleForm(service);

  return visibleRequirementLines(service).flatMap((line) => {
    if (!isChoiceLine(line)) {
      return bundle
        ? [
            {
              key: `auto-${line.type}`,
              label: text.bundleTitle(line),
              value: text.autoChosen(line),
            },
          ]
        : [];
    }
    const picked = draft.resourceIds[line.choiceIndex] ?? null;
    const name =
      options === undefined
        ? undefined
        : optionsForChoice(options, line).find((option) => option.resourceId === picked)?.name;
    return name === undefined
      ? []
      : [
          {
            key: `choice-${line.type}`,
            label: bundle ? text.bundleTitle(line) : text.singleTitle(),
            value: name,
          },
        ];
  });
}
