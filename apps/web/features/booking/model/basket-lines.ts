import type {
  HotsiteServiceLeg,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
  ResourceSelectionItem,
  ResourceType,
} from '@ikaro/types';
import { isCustomerSelectedDuration } from './duration-options';
import { orderPicks } from './resource-picks';
import { isPerTimeService, perTimeFromAmount } from './selection-totals';

/** The customer's chosen duration for the basket's variable-duration service, once quoted. */
export interface ChosenDuration {
  readonly minutes: number;
  /** The server-quoted total for `minutes`; null until the quote resolves. */
  readonly quotedAmount: number | null;
}

export type ResourceLabel =
  | { readonly kind: 'chosen'; readonly type: ResourceType; readonly name: string }
  | { readonly kind: 'auto'; readonly type: ResourceType };

export interface BasketLeg {
  readonly legIndex: number;
  readonly name: string;
  readonly durationMinutes: number;
  /** Transition before the next leg; 0 for the last leg (it never contributes to the span). */
  readonly transitionGapMinutes: number;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly resources: readonly ResourceLabel[];
}

export interface BasketLine {
  readonly serviceId: string;
  readonly name: string;
  readonly amount: number;
  /** The catalogue's formatted price; null when the amount is computed (a per-time service). */
  readonly priceFormatted: string | null;
  /** True while a per-time amount is only the "from" floor (no duration quoted yet). */
  readonly isFloor: boolean;
  readonly durationMinutes: number | null;
  /** The customer picks this line's duration (`CUSTOMER_SELECTED`): it is shown on the row. */
  readonly isDurationChosen: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  /** The journey's timeline, for a legged service. */
  readonly legs: readonly BasketLeg[] | null;
  /** The customer's own picks (a flat service or bundle); an automatic resource is never listed. */
  readonly resources: readonly ResourceLabel[];
}

export interface BasketComposition {
  readonly lines: readonly BasketLine[];
  readonly amount: number;
  readonly durationMinutes: number;
  readonly isFloor: boolean;
  readonly hasJourney: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

export interface ComposeBasketInput {
  /** Every bookable service of the hotsite; the basket is `serviceIds` resolved against it. */
  readonly services: readonly HotsiteServiceResponse[];
  /** In selection order — the order `POST /bookings` receives them and the backend lays lines out. */
  readonly serviceIds: readonly string[];
  readonly picks: readonly ResourceSelectionItem[];
  readonly requirements: readonly HotsiteServiceResourceOptionsRequirement[];
  readonly duration: ChosenDuration | null;
  readonly slotStart: Date | null;
}

const MS_PER_MINUTE = 60_000;

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MS_PER_MINUTE);
}

function pickName(
  pick: ResourceSelectionItem,
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
): string | undefined {
  return requirements
    .find(
      (req) =>
        req.serviceId === pick.serviceId &&
        (req.legIndex ?? null) === (pick.legIndex ?? null) &&
        req.resourceType === pick.resourceType,
    )
    ?.options.find((option) => option.resourceId === pick.resourceId)?.name;
}

function chosenLabels(
  serviceId: string,
  picks: readonly ResourceSelectionItem[],
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
): ResourceLabel[] {
  return orderPicks(
    picks.filter((pick) => pick.serviceId === serviceId),
    [serviceId],
  ).flatMap((pick) => {
    const name = pickName(pick, requirements);
    return name ? [{ kind: 'chosen' as const, type: pick.resourceType, name }] : [];
  });
}

// What a leg shows BEFORE booking: the customer's own pick for a CUSTOMER_CHOICE requirement, the
// resource TYPE for an automatic one (no assignment preview exists — never a pool or unit name).
function legLabels(
  serviceId: string,
  leg: HotsiteServiceLeg,
  picks: readonly ResourceSelectionItem[],
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
): ResourceLabel[] {
  return leg.resourceRequirements.flatMap((requirement): ResourceLabel[] => {
    if (requirement.type === 'LOCATION' || requirement.selectionMode === 'NONE') return [];
    if (requirement.selectionMode !== 'CUSTOMER_CHOICE') {
      return [{ kind: 'auto', type: requirement.type }];
    }
    const pick = picks.find(
      (candidate) =>
        candidate.serviceId === serviceId &&
        candidate.legIndex === leg.legIndex &&
        candidate.resourceType === requirement.type,
    );
    const name = pick ? pickName(pick, requirements) : undefined;
    return name ? [{ kind: 'chosen', type: requirement.type, name }] : [];
  });
}

function composeLegs(
  service: HotsiteServiceResponse,
  lineStart: Date | null,
  picks: readonly ResourceSelectionItem[],
  requirements: readonly HotsiteServiceResourceOptionsRequirement[],
): BasketLeg[] | null {
  if (!service.legs || service.legs.length === 0) return null;
  const ordered = [...service.legs].sort((a, b) => a.legIndex - b.legIndex);
  let offset = 0;
  return ordered.map((leg, index) => {
    const startsAt = lineStart ? addMinutes(lineStart, offset) : null;
    const gap = index === ordered.length - 1 ? 0 : leg.transitionGapAfterMinutes;
    offset += leg.durationMinutes + gap;
    return {
      legIndex: leg.legIndex,
      name: leg.name,
      durationMinutes: leg.durationMinutes,
      transitionGapMinutes: gap,
      startsAt,
      endsAt: startsAt ? addMinutes(startsAt, leg.durationMinutes) : null,
      resources: legLabels(service.id, leg, picks, requirements),
    };
  });
}

function priceOf(
  service: HotsiteServiceResponse,
  duration: ChosenDuration | null,
): Pick<BasketLine, 'amount' | 'priceFormatted' | 'isFloor'> {
  if (!isCustomerSelectedDuration(service) && !isPerTimeService(service)) {
    return {
      amount: service.price.amount,
      priceFormatted: service.price.formatted,
      isFloor: false,
    };
  }
  if (isCustomerSelectedDuration(service) && duration?.quotedAmount != null) {
    return { amount: duration.quotedAmount, priceFormatted: null, isFloor: false };
  }
  return { amount: perTimeFromAmount(service), priceFormatted: null, isFloor: true };
}

function durationOf(
  service: HotsiteServiceResponse,
  duration: ChosenDuration | null,
): number | null {
  if (isCustomerSelectedDuration(service)) return duration?.minutes ?? null;
  return isPerTimeService(service) ? null : service.durationMinutes;
}

/**
 * The basket as one row per line plus one total — the single composition the summary card, the
 * Confirmation / journey review and the success box all render, so they can never disagree.
 *
 * Lines run back-to-back from the chosen slot in selection order, each advancing the cursor by its
 * own duration — exactly the backend's cursor (`availability-window-resolution.helpers.ts`,
 * `resource-occupancy.helpers.ts`). A legged service's duration is its legs' span (the backend keeps
 * `service.durationMinutes` equal to it), so a journey line ends where its last leg ends; its legs
 * are laid out from the line's own start, never from the slot, when it is not the first line.
 */
export function composeBasket(input: ComposeBasketInput): BasketComposition {
  const { services, serviceIds, picks, requirements, duration, slotStart } = input;
  let cursor = slotStart;
  const lines = serviceIds.flatMap((serviceId): BasketLine[] => {
    const service = services.find((candidate) => candidate.id === serviceId);
    if (!service) return [];
    const durationMinutes = durationOf(service, duration);
    const startsAt = cursor;
    const endsAt =
      startsAt && durationMinutes !== null ? addMinutes(startsAt, durationMinutes) : null;
    if (endsAt) cursor = endsAt;
    const legs = composeLegs(service, startsAt, picks, requirements);
    return [
      {
        serviceId,
        name: service.name,
        ...priceOf(service, duration),
        durationMinutes,
        isDurationChosen: isCustomerSelectedDuration(service),
        startsAt,
        endsAt,
        legs,
        resources: legs ? [] : chosenLabels(serviceId, picks, requirements),
      },
    ];
  });

  return {
    lines,
    amount: lines.reduce((sum, line) => sum + line.amount, 0),
    durationMinutes: lines.reduce((sum, line) => sum + (line.durationMinutes ?? 0), 0),
    isFloor: lines.some((line) => line.isFloor),
    hasJourney: lines.some((line) => line.legs !== null),
    startsAt: slotStart,
    endsAt: cursor === slotStart ? null : cursor,
  };
}
