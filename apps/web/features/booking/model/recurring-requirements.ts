import type {
  HotsiteServiceResourceOption,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceRequirementSelectionMode,
  ResourceType,
} from '@ikaro/types';

// How a service's resource requirements look to the customer's "new recurring reservation" form
// (TD49 Story 2). Pure, no React: the staff-side creation (M23-S19) reuses it.

/**
 * One resource requirement of a service as the form needs it (TD49 Story 2). A bundle has several;
 * only the `CUSTOMER_CHOICE` ones carry a pick, the rest are resolved per occurrence.
 */
export interface ResourceRequirementLine {
  readonly type: ResourceType;
  readonly selectionMode: ResourceRequirementSelectionMode;
  /** Position among the service's `CUSTOMER_CHOICE` requirements (the index into the draft's picks); null otherwise. */
  readonly choiceIndex: number | null;
  /** Position among the `CUSTOMER_CHOICE` requirements of this same type: which options entry it reads. */
  readonly choiceOfTypeIndex: number | null;
  /** 1-based number among the service's requirements of this type, only when the type repeats (else null). */
  readonly typeNumber: number | null;
}

/** The service's requirements in order, with the positions the picks and the titles need. */
export function requirementLines(service: HotsiteServiceResponse): ResourceRequirementLine[] {
  const typeTotals = new Map<ResourceType, number>();
  for (const requirement of service.resourceRequirements) {
    typeTotals.set(requirement.type, (typeTotals.get(requirement.type) ?? 0) + 1);
  }
  const seenOfType = new Map<ResourceType, number>();
  const choiceOfType = new Map<ResourceType, number>();
  let choiceCount = 0;
  return service.resourceRequirements.map((requirement) => {
    const seen = (seenOfType.get(requirement.type) ?? 0) + 1;
    seenOfType.set(requirement.type, seen);
    const isChoice = requirement.selectionMode === 'CUSTOMER_CHOICE';
    const choiceOfTypeIndex = isChoice ? (choiceOfType.get(requirement.type) ?? 0) : null;
    if (isChoice) choiceOfType.set(requirement.type, (choiceOfTypeIndex ?? 0) + 1);
    const choiceIndex = isChoice ? choiceCount : null;
    if (isChoice) choiceCount += 1;
    return {
      type: requirement.type,
      selectionMode: requirement.selectionMode,
      choiceIndex,
      choiceOfTypeIndex,
      typeNumber: (typeTotals.get(requirement.type) ?? 0) > 1 ? seen : null,
    };
  });
}

/** A requirement the customer picks a resource for. */
export type ChoiceRequirementLine = ResourceRequirementLine & {
  readonly choiceIndex: number;
  readonly choiceOfTypeIndex: number;
};

export function isChoiceLine(line: ResourceRequirementLine): line is ChoiceRequirementLine {
  return line.choiceIndex !== null && line.choiceOfTypeIndex !== null;
}

/** The requirements the customer picks a resource for, in the service's order. */
export function choiceRequirements(service: HotsiteServiceResponse): ChoiceRequirementLine[] {
  return requirementLines(service).filter(isChoiceLine);
}

/**
 * The requirements the form shows something for: every one but the default-location `NONE` of an
 * older service, which is checked and held but has nothing to choose or tell.
 */
export function visibleRequirementLines(
  service: HotsiteServiceResponse,
): ResourceRequirementLine[] {
  return requirementLines(service).filter((line) => line.selectionMode !== 'NONE');
}

/**
 * A bundle as the form sees it: more than one visible requirement. Only then do the groups carry
 * their type's title and the automatic requirements get an info line; a single requirement keeps
 * the plain "Recurso" field (or nothing, when it is automatic).
 */
export function isBundleForm(service: HotsiteServiceResponse): boolean {
  return visibleRequirementLines(service).length > 1;
}

/** The options the customer may pick for one choice requirement (same-type entries match in order). */
export function optionsForChoice(
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
  line: ChoiceRequirementLine,
): readonly HotsiteServiceResourceOption[] {
  return (
    requirements.filter((entry) => entry.resourceType === line.type)[line.choiceOfTypeIndex]
      ?.options ?? []
  );
}

/** Only a `CUSTOMER_CHOICE` requirement shows a resource control (and makes the schedule FIXED_ASSIGNMENT). */
export function requiresResourceChoice(service: HotsiteServiceResponse): boolean {
  return choiceRequirements(service).length > 0;
}
