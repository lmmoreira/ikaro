import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { BookingResourceSelectionRequiredError } from '../../domain/errors/booking-domain.error';
import { RecurringBookingScheduleIneligibleServiceError } from '../../domain/errors/recurring-booking-schedule.error';
import {
  ResourceRequirement,
  ResourceRequirementSelectionMode,
} from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { ServiceLeg } from '../../domain/service-leg';
import { Service } from '../../domain/service.aggregate';
import {
  assertServiceEligible,
  buildResourceAssignments,
} from './recurring-booking-schedule-eligibility.helpers';
import {
  deriveAssignmentPolicy,
  pickCustomerChoices,
} from './recurring-service-requirement.helpers';

const TENANT = '10000000-0000-4000-8000-000000000410';

const location = (selectionMode: ResourceRequirementSelectionMode, resourcePoolIds?: string[]) =>
  ResourceRequirement.create({ type: ResourceType.LOCATION, selectionMode, resourcePoolIds });
const room = (selectionMode: ResourceRequirementSelectionMode, requiredQuantity = 1) =>
  ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode, requiredQuantity });
const staff = (selectionMode: ResourceRequirementSelectionMode = 'AUTO_ANY') =>
  ResourceRequirement.create({ type: ResourceType.STAFF, selectionMode });

function service(
  requirements: ResourceRequirement[],
  options: { legs?: boolean; pickup?: boolean; recurrence?: boolean } = {},
): Service {
  return new ServiceBuilder()
    .withTenantId(TENANT)
    .withBookingModel('APPOINTMENT')
    .withBookingPolicy({ recurrenceEligible: options.recurrence ?? true })
    .withRequiresPickupAddress(options.pickup ?? false)
    .withResourceRequirements(requirements)
    .withLegs(
      options.legs
        ? [
            ServiceLeg.create({
              legIndex: 0,
              name: 'Etapa',
              durationMinutes: 30,
              resourceRequirements: [room('AUTO_ANY')],
              transitionGapAfterMinutes: 0,
            }),
          ]
        : null,
    )
    .build();
}

// TD49-S03 / Story 0 — the web filter (recurrence-shape.spec.ts) is driven by a shape table of its
// own and is deliberately narrower until Story 2 gives the form a picker per requirement.
describe('assertServiceEligible', () => {
  type IneligibleReason = ConstructorParameters<
    typeof RecurringBookingScheduleIneligibleServiceError
  >[0];

  const accepted: [string, () => Service][] = [
    ['no requirement', () => service([])],
    ['a stored unrestricted NONE location', () => service([location('NONE')])],
    [
      'a stored unrestricted NONE location with an empty pool list',
      () => service([location('NONE', [])]),
    ],
    ['one CUSTOMER_CHOICE room', () => service([room('CUSTOMER_CHOICE')])],
    ['one AUTO_ANY room', () => service([room('AUTO_ANY')])],
    ['one AUTO_FUNGIBLE_POOL room', () => service([room('AUTO_FUNGIBLE_POOL')])],
    ['an AUTO_ANY location', () => service([location('AUTO_ANY')])],
    ['a staff + room bundle', () => service([staff('CUSTOMER_CHOICE'), room('AUTO_ANY')])],
    [
      'a bundle of two automatic requirements',
      () => service([staff(), room('AUTO_FUNGIBLE_POOL')]),
    ],
    [
      'a bundle with a stored NONE location (an older location + staff service)',
      () => service([location('NONE'), staff('CUSTOMER_CHOICE')]),
    ],
    ['three requirements', () => service([staff(), room('AUTO_ANY'), location('NONE')])],
  ];

  const refused: [string, () => Service, IneligibleReason][] = [
    ['a service with legs', () => service([], { legs: true }), 'legged-or-bundled'],
    [
      'a bundle of a service with legs',
      () => service([staff(), room('AUTO_ANY')], { legs: true }),
      'legged-or-bundled',
    ],
    [
      'a requirement of quantity 2',
      () => service([room('AUTO_FUNGIBLE_POOL', 2)]),
      'legged-or-bundled',
    ],
    [
      'a quantity-2 requirement inside a bundle',
      () => service([staff(), room('AUTO_FUNGIBLE_POOL', 2)]),
      'legged-or-bundled',
    ],
    [
      'a pickup-address service with no requirement',
      () => service([], { pickup: true }),
      'requires-pickup-address',
    ],
    [
      'a pickup-address bundle',
      () => service([staff(), room('AUTO_ANY')], { pickup: true }),
      'requires-pickup-address',
    ],
    [
      'recurrence switched off on a default service',
      () => service([], { recurrence: false }),
      'recurrence-not-enabled',
    ],
    [
      'recurrence switched off on a bundle',
      () => service([staff(), room('AUTO_ANY')], { recurrence: false }),
      'recurrence-not-enabled',
    ],
    [
      'a NONE room (NONE is accepted for the unrestricted location only)',
      () => service([room('NONE')]),
      'selection-mode-mismatch',
    ],
    [
      'a NONE location restricted to a pool',
      () => service([location('NONE', [uuidv7()])]),
      'selection-mode-mismatch',
    ],
    [
      'a NONE room inside a bundle',
      () => service([staff(), room('NONE')]),
      'selection-mode-mismatch',
    ],
  ];

  it.each(accepted)('accepts %s', (_name, build) => {
    expect(() => assertServiceEligible(build())).not.toThrow();
  });

  it.each(refused)('refuses %s', (_name, build, reason) => {
    let thrown: unknown;
    try {
      assertServiceEligible(build());
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(RecurringBookingScheduleIneligibleServiceError);
    expect((thrown as Error).message).toBe(
      new RecurringBookingScheduleIneligibleServiceError(reason).message,
    );
  });

  it('names only legs and multi-unit requirements as excluded, never a bundle', () => {
    const message = new RecurringBookingScheduleIneligibleServiceError('legged-or-bundled').message;

    expect(message).toContain('legs');
    expect(message).not.toMatch(/bundle|single-resource/i);
  });
});

describe('deriveAssignmentPolicy', () => {
  it.each([
    ['no requirement', () => service([]), 'RESOLVE_PER_OCCURRENCE'],
    ['a stored NONE location', () => service([location('NONE')]), 'RESOLVE_PER_OCCURRENCE'],
    ['one CUSTOMER_CHOICE room', () => service([room('CUSTOMER_CHOICE')]), 'FIXED_ASSIGNMENT'],
    ['one AUTO_ANY room', () => service([room('AUTO_ANY')]), 'RESOLVE_PER_OCCURRENCE'],
    [
      'a bundle of automatic requirements',
      () => service([staff(), room('AUTO_FUNGIBLE_POOL')]),
      'RESOLVE_PER_OCCURRENCE',
    ],
    [
      'a mixed bundle',
      () => service([staff('CUSTOMER_CHOICE'), room('AUTO_ANY')]),
      'FIXED_ASSIGNMENT',
    ],
    [
      'a bundle of two customer choices',
      () => service([staff('CUSTOMER_CHOICE'), room('CUSTOMER_CHOICE')]),
      'FIXED_ASSIGNMENT',
    ],
  ] as const)('derives the policy for %s', (_name, build, policy) => {
    expect(deriveAssignmentPolicy(build())).toBe(policy);
  });
});

describe('pickCustomerChoices and buildResourceAssignments', () => {
  const staffId = uuidv7();
  const roomId = uuidv7();

  it('picks one resource per CUSTOMER_CHOICE requirement and ignores the other requirements', () => {
    const requirements = [staff('CUSTOMER_CHOICE'), room('AUTO_ANY')];

    const picks = pickCustomerChoices(requirements, [
      { resourceType: 'STAFF', resourceId: staffId },
      { resourceType: 'ROOM', resourceId: roomId },
    ]);

    expect(picks).toEqual([{ requirement: requirements[0], resourceId: staffId }]);
  });

  it('returns no pick for a service without a CUSTOMER_CHOICE requirement', () => {
    expect(pickCustomerChoices([room('AUTO_ANY')], [])).toEqual([]);
  });

  it('rejects a missing pick', () => {
    expect(() => pickCustomerChoices([staff('CUSTOMER_CHOICE')], [])).toThrow(
      BookingResourceSelectionRequiredError,
    );
  });

  it('rejects a pick of the wrong type as missing', () => {
    expect(() =>
      pickCustomerChoices(
        [staff('CUSTOMER_CHOICE')],
        [{ resourceType: 'ROOM', resourceId: roomId }],
      ),
    ).toThrow(BookingResourceSelectionRequiredError);
  });

  it('consumes selections of one type in requirement order', () => {
    const second = uuidv7();
    const requirements = [staff('CUSTOMER_CHOICE'), staff('CUSTOMER_CHOICE')];

    const picks = pickCustomerChoices(requirements, [
      { resourceType: 'STAFF', resourceId: staffId },
      { resourceType: 'STAFF', resourceId: second },
    ]);

    expect(picks.map((pick) => pick.resourceId)).toEqual([staffId, second]);
  });

  it('never lets one resource satisfy two requirements', () => {
    expect(() =>
      pickCustomerChoices(
        [staff('CUSTOMER_CHOICE'), staff('CUSTOMER_CHOICE')],
        [
          { resourceType: 'STAFF', resourceId: staffId },
          { resourceType: 'STAFF', resourceId: staffId },
        ],
      ),
    ).toThrow(BookingResourceSelectionRequiredError);
  });

  it('writes an assignment row per pick with the resource type and no requirement id or position', () => {
    const requirement = staff('CUSTOMER_CHOICE');

    expect(buildResourceAssignments([{ requirement, resourceId: staffId }])).toEqual([
      {
        resourceId: staffId,
        resourceType: ResourceType.STAFF,
        requirementId: null,
        requiredQuantityPosition: null,
      },
    ]);
  });

  it('writes no row when nothing was picked', () => {
    expect(buildResourceAssignments([])).toEqual([]);
  });
});
