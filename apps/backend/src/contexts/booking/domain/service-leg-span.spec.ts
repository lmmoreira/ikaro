import { ResourceRequirement } from './resource-requirement';
import { ResourceType } from './resource.types';
import { computeLegsTotalSpanMinutes } from './service-leg-span';
import { ServiceLeg } from './service-leg';

const REQUIREMENT = ResourceRequirement.create({
  type: ResourceType.ROOM,
  selectionMode: 'AUTO_ANY',
});

describe('computeLegsTotalSpanMinutes()', () => {
  it('sums durations and every gap except the last leg', () => {
    const legs = [
      ServiceLeg.create({
        legIndex: 0,
        name: 'A',
        durationMinutes: 20,
        resourceRequirements: [REQUIREMENT],
        transitionGapAfterMinutes: 10,
      }),
      ServiceLeg.create({
        legIndex: 1,
        name: 'B',
        durationMinutes: 50,
        resourceRequirements: [REQUIREMENT],
        transitionGapAfterMinutes: 999, // must never be counted — it's the last leg
      }),
    ];
    expect(computeLegsTotalSpanMinutes(legs)).toBe(80); // 20 + 50 + 10
  });

  it('returns just the duration for a single leg (no gap to add)', () => {
    const legs = [
      ServiceLeg.create({
        legIndex: 0,
        name: 'A',
        durationMinutes: 30,
        resourceRequirements: [REQUIREMENT],
        transitionGapAfterMinutes: 15,
      }),
    ];
    expect(computeLegsTotalSpanMinutes(legs)).toBe(30);
  });
});
