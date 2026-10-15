import type { SchedulingExceptionItem } from '@ikaro/types';

// Pure view helpers of the "Reservas a resolver" worklist — no React, so the grouping and the
// reassign choices are unit-tested on their own.

export interface SchedulingExceptionGroup {
  readonly sourceId: string;
  // The deactivated resource's name ("<nome> ficou indisponível"); null when it cannot be read.
  readonly sourceName: string | null;
  readonly items: readonly SchedulingExceptionItem[];
}

// One group per unavailable resource (the entry's `sourceId`), in the order the first entry of
// each group appears — the list arrives earliest booking first, so the most urgent group leads.
export function groupBySource(
  items: readonly SchedulingExceptionItem[],
): readonly SchedulingExceptionGroup[] {
  const groups = new Map<string, SchedulingExceptionItem[]>();
  for (const item of items) {
    const bucket = groups.get(item.sourceId);
    if (bucket) bucket.push(item);
    else groups.set(item.sourceId, [item]);
  }
  return Array.from(groups.entries()).map(([sourceId, groupItems]) => ({
    sourceId,
    sourceName: groupItems.find((i) => i.booking?.resourceName)?.booking?.resourceName ?? null,
    items: groupItems,
  }));
}

// Only a confirmed booking can be rescheduled; and only when it can be read at all.
export function isReschedulable(item: SchedulingExceptionItem): boolean {
  return item.booking?.status === 'APPROVED';
}

export interface ReassignChoice {
  readonly resourceId: string;
  readonly resourceName: string;
  // In how many of the selected entries this resource is a stored alternative (free at raise time).
  readonly freeIn: number;
  readonly total: number;
}

// The union of the selected entries' stored alternatives. A resource missing from an entry's
// alternatives is simply not compatible with it — the data carries no "busy" reasons — so each
// choice only says "livre em N de M reservas". Most compatible first, then by name.
export function buildReassignChoices(
  selected: readonly SchedulingExceptionItem[],
): readonly ReassignChoice[] {
  const byResource = new Map<string, { name: string; count: number }>();
  for (const item of selected) {
    for (const alt of item.alternatives) {
      const entry = byResource.get(alt.resourceId);
      if (entry) entry.count += 1;
      else byResource.set(alt.resourceId, { name: alt.resourceName, count: 1 });
    }
  }
  return Array.from(byResource.entries())
    .map(([resourceId, { name, count }]) => ({
      resourceId,
      resourceName: name,
      freeIn: count,
      total: selected.length,
    }))
    .sort((a, b) => b.freeIn - a.freeIn || a.resourceName.localeCompare(b.resourceName));
}

export interface AlternativesSummary {
  readonly names: readonly string[];
  // How many alternatives were left out of `names` (at most two names are shown).
  readonly more: number;
}

const MAX_ALTERNATIVE_NAMES = 2;

export function summarizeAlternatives(item: SchedulingExceptionItem): AlternativesSummary {
  const names = item.alternatives.map((a) => a.resourceName);
  return {
    names: names.slice(0, MAX_ALTERNATIVE_NAMES),
    more: Math.max(0, names.length - MAX_ALTERNATIVE_NAMES),
  };
}
