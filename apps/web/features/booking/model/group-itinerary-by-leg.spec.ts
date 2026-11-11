import type { BookingItineraryLeg } from '@ikaro/types';
import { describe, expect, it } from 'vitest';
import { groupItineraryByLeg } from './group-itinerary-by-leg';

const row = (overrides: Partial<BookingItineraryLeg>): BookingItineraryLeg => ({
  lineId: 'line-1',
  serviceName: 'Circuito',
  legIndex: 0,
  legName: 'Massagem',
  resourceType: 'ROOM',
  resourceName: 'Sala Fogo',
  startsAt: null,
  endsAt: null,
  ...overrides,
});

describe('groupItineraryByLeg', () => {
  it('folds the six resource rows of a three-leg service into three steps', () => {
    const steps = groupItineraryByLeg([
      row({ legIndex: 0, legName: 'Massagem', resourceName: 'Sala Fogo' }),
      row({ legIndex: 0, legName: 'Massagem', resourceName: 'Leonardo Moreira' }),
      row({ legIndex: 1, legName: 'Pedras Aromatizantes', resourceName: 'Sala Fogo' }),
      row({ legIndex: 2, legName: 'Ventosas', resourceName: 'Ventosas' }),
      row({ legIndex: 2, legName: 'Ventosas', resourceName: 'Sala Agua' }),
      row({ legIndex: 2, legName: 'Ventosas', resourceName: 'Leonardo Moreira' }),
    ]);

    expect(steps.map((s) => s.legName)).toEqual(['Massagem', 'Pedras Aromatizantes', 'Ventosas']);
    expect(steps.map((s) => s.resourceNames)).toEqual([
      ['Sala Fogo', 'Leonardo Moreira'],
      ['Sala Fogo'],
      ['Ventosas', 'Sala Agua', 'Leonardo Moreira'],
    ]);
  });

  it('returns an empty list for no rows', () => {
    expect(groupItineraryByLeg([])).toEqual([]);
  });

  it('keeps a leg with a single row as one step', () => {
    expect(groupItineraryByLeg([row({})])).toHaveLength(1);
  });

  it('does not merge two lines whose legs share an index', () => {
    const steps = groupItineraryByLeg([
      row({ lineId: 'line-1', legIndex: 0, resourceName: 'Sala Fogo' }),
      row({ lineId: 'line-2', legIndex: 0, serviceName: 'Outro', resourceName: 'Sala Agua' }),
    ]);

    expect(steps).toHaveLength(2);
    expect(steps[0]!.resourceNames).toEqual(['Sala Fogo']);
    expect(steps[1]!.serviceName).toBe('Outro');
  });

  it('lists a resource name once when a leg repeats it', () => {
    const steps = groupItineraryByLeg([
      row({ resourceType: 'ROOM', resourceName: 'Sala Fogo' }),
      row({ resourceType: 'EQUIPMENT', resourceName: 'Sala Fogo' }),
    ]);

    expect(steps[0]!.resourceNames).toEqual(['Sala Fogo']);
  });

  it('spans the earliest start to the latest end of the leg rows', () => {
    const steps = groupItineraryByLeg([
      row({
        resourceName: 'A',
        startsAt: '2026-06-16T12:05:00.000Z',
        endsAt: '2026-06-16T12:30:00.000Z',
      }),
      row({
        resourceName: 'B',
        startsAt: '2026-06-16T12:00:00.000Z',
        endsAt: '2026-06-16T12:25:00.000Z',
      }),
    ]);

    expect(steps[0]!.startsAt).toBe('2026-06-16T12:00:00.000Z');
    expect(steps[0]!.endsAt).toBe('2026-06-16T12:30:00.000Z');
  });

  it('has no time range when no row has one', () => {
    const steps = groupItineraryByLeg([row({ resourceName: 'A' }), row({ resourceName: 'B' })]);

    expect(steps[0]!.startsAt).toBeNull();
    expect(steps[0]!.endsAt).toBeNull();
  });

  it('uses the times that exist when the rows of a leg disagree', () => {
    const steps = groupItineraryByLeg([
      row({ resourceName: 'A' }),
      row({
        resourceName: 'B',
        startsAt: '2026-06-16T12:00:00.000Z',
        endsAt: '2026-06-16T12:30:00.000Z',
      }),
    ]);

    expect(steps[0]!.startsAt).toBe('2026-06-16T12:00:00.000Z');
    expect(steps[0]!.endsAt).toBe('2026-06-16T12:30:00.000Z');
  });

  it('never re-sorts: rows out of leg order come out in the order given', () => {
    const steps = groupItineraryByLeg([
      row({ legIndex: 2, legName: 'Volta' }),
      row({ legIndex: 0, legName: 'Ida' }),
      row({ legIndex: 1, legName: 'Passeio' }),
    ]);

    expect(steps.map((s) => s.legName)).toEqual(['Volta', 'Ida', 'Passeio']);
  });
});
