import { describe, expect, it } from 'vitest';
import type { SchedulingExceptionItem } from '@ikaro/types';
import {
  buildReassignChoices,
  groupBySource,
  isReschedulable,
  summarizeAlternatives,
} from './scheduling-exception-view';

function item(
  overrides: Partial<SchedulingExceptionItem> & { id: string },
  booking: Partial<NonNullable<SchedulingExceptionItem['booking']>> | null = {},
): SchedulingExceptionItem {
  return {
    sourceType: 'RESOURCE_DEACTIVATION',
    sourceId: 'res-1',
    affectedType: 'BOOKING',
    affectedId: `bk-${overrides.id}`,
    status: 'OPEN',
    alternatives: [],
    createdAt: '2026-10-14T12:00:00.000Z',
    booking:
      booking === null
        ? null
        : {
            contactName: 'Ana',
            scheduledAt: '2026-10-20T12:00:00.000Z',
            totalDurationMins: 60,
            serviceNames: ['Sessão'],
            status: 'APPROVED',
            resourceName: 'Box 2',
            isCustomer: true,
            totalPrice: { amount: 100, currency: 'BRL' },
            ...booking,
          },
    ...overrides,
  };
}

describe('groupBySource', () => {
  it('groups by the unavailable resource, keeping the order the groups first appear', () => {
    const groups = groupBySource([
      item({ id: 'a', sourceId: 'res-1' }, { resourceName: 'Box 2' }),
      item({ id: 'b', sourceId: 'res-2' }, { resourceName: 'Walace' }),
      item({ id: 'c', sourceId: 'res-1' }, { resourceName: 'Box 2' }),
    ]);

    expect(groups.map((g) => [g.sourceId, g.sourceName, g.items.map((i) => i.id)])).toEqual([
      ['res-1', 'Box 2', ['a', 'c']],
      ['res-2', 'Walace', ['b']],
    ]);
  });

  it('takes the name from any readable booking of the group, null when none can be read', () => {
    const named = groupBySource([
      item({ id: 'a' }, null),
      item({ id: 'b' }, { resourceName: 'Box 2' }),
    ]);
    const unnamed = groupBySource([item({ id: 'a' }, null)]);

    expect(named[0].sourceName).toBe('Box 2');
    expect(unnamed[0].sourceName).toBeNull();
  });

  it('returns no groups for an empty list', () => {
    expect(groupBySource([])).toEqual([]);
  });
});

describe('isReschedulable', () => {
  it.each([
    ['APPROVED', true],
    ['PENDING', false],
    ['INFO_REQUESTED', false],
  ])('a %s booking → %s', (status, expected) => {
    expect(isReschedulable(item({ id: 'a' }, { status }))).toBe(expected);
  });

  it('is false when the booking cannot be read', () => {
    expect(isReschedulable(item({ id: 'a' }, null))).toBe(false);
  });
});

describe('buildReassignChoices', () => {
  const alt = (id: string, name: string) => ({ resourceId: id, resourceName: name });

  it('is the union of the stored alternatives, each with how many selected entries it is free for', () => {
    const choices = buildReassignChoices([
      item({ id: 'a', alternatives: [alt('r1', 'Box 1'), alt('r3', 'Box 3')] }),
      item({ id: 'b', alternatives: [alt('r1', 'Box 1')] }),
    ]);

    expect(choices).toEqual([
      { resourceId: 'r1', resourceName: 'Box 1', freeIn: 2, total: 2 },
      { resourceId: 'r3', resourceName: 'Box 3', freeIn: 1, total: 2 },
    ]);
  });

  it('puts the most compatible first, then alphabetical', () => {
    const choices = buildReassignChoices([
      item({ id: 'a', alternatives: [alt('r2', 'Zeta'), alt('r1', 'Alfa')] }),
    ]);

    expect(choices.map((c) => c.resourceName)).toEqual(['Alfa', 'Zeta']);
  });

  it('offers nothing when no entry has an alternative', () => {
    expect(buildReassignChoices([item({ id: 'a' })])).toEqual([]);
  });
});

describe('summarizeAlternatives', () => {
  const alts = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ resourceId: `r${i}`, resourceName: `Box ${i + 1}` }));

  it.each([
    [0, [], 0],
    [1, ['Box 1'], 0],
    [2, ['Box 1', 'Box 2'], 0],
    [3, ['Box 1', 'Box 2'], 1],
    [5, ['Box 1', 'Box 2'], 3],
  ])('%i alternatives → names %j and %i more', (count, names, more) => {
    expect(summarizeAlternatives(item({ id: 'a', alternatives: alts(count) }))).toEqual({
      names,
      more,
    });
  });
});
