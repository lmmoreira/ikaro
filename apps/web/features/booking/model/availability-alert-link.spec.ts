import { describe, expect, it } from 'vitest';
import type { ResourceSelectionItem } from '@ikaro/types';
import { choiceRequirement, hotsiteServiceBookingDefaults, makeHotsiteService } from '@/test-utils';
import {
  availabilityAlertPagePath,
  buildAvailabilityAlertLink,
  isCompositeService,
  parseAvailabilityAlertParams,
} from './availability-alert-link';

const SERVICE_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_ID = '10000000-0000-4000-8000-000000000002';
const RESOURCE_ID = '20000000-0000-4000-8000-000000000001';
const OTHER_RESOURCE_ID = '20000000-0000-4000-8000-000000000002';

const eligibleService = (overrides = {}) =>
  makeHotsiteService({
    id: SERVICE_ID,
    bookingPolicy: {
      ...hotsiteServiceBookingDefaults.bookingPolicy,
      availabilityAlertEligible: true,
    },
    ...overrides,
  });

const pick = (serviceId: string, resourceId: string, legIndex?: number): ResourceSelectionItem => ({
  serviceId,
  resourceType: 'STAFF',
  resourceId,
  ...(legIndex === undefined ? {} : { legIndex }),
});

describe('buildAvailabilityAlertLink()', () => {
  it('links to the alert page with just the service for a basket of one eligible service', () => {
    expect(
      buildAvailabilityAlertLink({
        slug: 'acme',
        services: [eligibleService()],
        resourceSelections: [],
      }),
    ).toBe(`/acme/booking/availability-alert?serviceId=${SERVICE_ID}`);
  });

  it('is null when the service is not alert-eligible', () => {
    expect(
      buildAvailabilityAlertLink({
        slug: 'acme',
        services: [makeHotsiteService({ id: SERVICE_ID })],
        resourceSelections: [],
      }),
    ).toBeNull();
  });

  it('is null for a basket of several services — an alert is for exactly one', () => {
    expect(
      buildAvailabilityAlertLink({
        slug: 'acme',
        services: [eligibleService(), eligibleService({ id: OTHER_ID })],
        resourceSelections: [],
      }),
    ).toBeNull();
  });

  it('is null for an empty basket', () => {
    expect(
      buildAvailabilityAlertLink({ slug: 'acme', services: [], resourceSelections: [] }),
    ).toBeNull();
  });

  it('carries the single resource pick of a flat service', () => {
    const link = buildAvailabilityAlertLink({
      slug: 'acme',
      services: [eligibleService({ resourceRequirements: [choiceRequirement('STAFF')] })],
      resourceSelections: [pick(SERVICE_ID, RESOURCE_ID)],
    });

    expect(link).toBe(
      `/acme/booking/availability-alert?serviceId=${SERVICE_ID}&preferredResourceId=${RESOURCE_ID}`,
    );
  });

  it('carries no resource when a bundle has several picks — an alert holds one preferred resource', () => {
    const link = buildAvailabilityAlertLink({
      slug: 'acme',
      services: [eligibleService()],
      resourceSelections: [pick(SERVICE_ID, RESOURCE_ID), pick(SERVICE_ID, OTHER_RESOURCE_ID)],
    });

    expect(link).toBe(`/acme/booking/availability-alert?serviceId=${SERVICE_ID}`);
  });

  it('carries no resource for a legged service even with one pick', () => {
    const link = buildAvailabilityAlertLink({
      slug: 'acme',
      services: [
        eligibleService({
          legs: [
            {
              legIndex: 0,
              name: 'Lavagem',
              durationMinutes: 30,
              resourceRequirements: [],
              transitionGapAfterMinutes: 0,
            },
          ],
        }),
      ],
      resourceSelections: [pick(SERVICE_ID, RESOURCE_ID, 0)],
    });

    expect(link).toBe(`/acme/booking/availability-alert?serviceId=${SERVICE_ID}`);
  });

  it('carries no resource for a bundle (several resource requirements) even with one pick', () => {
    const link = buildAvailabilityAlertLink({
      slug: 'acme',
      services: [
        eligibleService({
          resourceRequirements: [
            choiceRequirement('STAFF'),
            { type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
          ],
        }),
      ],
      resourceSelections: [pick(SERVICE_ID, RESOURCE_ID)],
    });

    expect(link).toBe(`/acme/booking/availability-alert?serviceId=${SERVICE_ID}`);
  });

  it('ignores a pick that belongs to another service', () => {
    const link = buildAvailabilityAlertLink({
      slug: 'acme',
      services: [eligibleService()],
      resourceSelections: [pick(OTHER_ID, RESOURCE_ID)],
    });

    expect(link).toBe(`/acme/booking/availability-alert?serviceId=${SERVICE_ID}`);
  });

  it('carries the chosen duration', () => {
    const link = buildAvailabilityAlertLink({
      slug: 'acme',
      services: [eligibleService()],
      resourceSelections: [],
      durationMinutes: 90,
    });

    expect(link).toBe(
      `/acme/booking/availability-alert?serviceId=${SERVICE_ID}&durationMinutes=90`,
    );
  });

  it('never carries a participant count', () => {
    const link = buildAvailabilityAlertLink({
      slug: 'acme',
      services: [eligibleService()],
      resourceSelections: [],
      durationMinutes: 30,
    });

    expect(link).not.toContain('participant');
  });
});

describe('isCompositeService()', () => {
  it('is false for a flat single-requirement service', () => {
    expect(isCompositeService(eligibleService())).toBe(false);
  });

  it('is true for a legged service', () => {
    expect(
      isCompositeService(
        eligibleService({
          legs: [
            {
              legIndex: 0,
              name: 'Lavagem',
              durationMinutes: 30,
              resourceRequirements: [],
              transitionGapAfterMinutes: 0,
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it('is true for a bundle — more than one resource requirement', () => {
    expect(
      isCompositeService(
        eligibleService({
          resourceRequirements: [
            choiceRequirement('STAFF'),
            { type: 'ROOM', selectionMode: 'AUTO_ANY', requiredQuantity: 1 },
          ],
        }),
      ),
    ).toBe(true);
  });
});

describe('availabilityAlertPagePath()', () => {
  it('is the one place that shapes the page URL, so the login returnTo equals the button link', () => {
    const params = { serviceId: SERVICE_ID, preferredResourceId: RESOURCE_ID, durationMinutes: 45 };
    const link = buildAvailabilityAlertLink({
      slug: 'acme',
      services: [eligibleService({ resourceRequirements: [choiceRequirement('STAFF')] })],
      resourceSelections: [pick(SERVICE_ID, RESOURCE_ID)],
      durationMinutes: 45,
    });

    expect(availabilityAlertPagePath('acme', params)).toBe(link);
  });

  it('omits what is absent and encodes nothing it should not', () => {
    expect(availabilityAlertPagePath('acme', { serviceId: SERVICE_ID })).toBe(
      `/acme/booking/availability-alert?serviceId=${SERVICE_ID}`,
    );
    expect(
      availabilityAlertPagePath('acme', {
        serviceId: SERVICE_ID,
        preferredResourceId: null,
        durationMinutes: null,
      }),
    ).toBe(`/acme/booking/availability-alert?serviceId=${SERVICE_ID}`);
  });
});

describe('parseAvailabilityAlertParams()', () => {
  it('reads the three parameters', () => {
    expect(
      parseAvailabilityAlertParams({
        serviceId: SERVICE_ID,
        preferredResourceId: RESOURCE_ID,
        durationMinutes: '90',
      }),
    ).toEqual({ serviceId: SERVICE_ID, preferredResourceId: RESOURCE_ID, durationMinutes: 90 });
  });

  it('treats absent parameters as null', () => {
    expect(parseAvailabilityAlertParams({ serviceId: SERVICE_ID })).toEqual({
      serviceId: SERVICE_ID,
      preferredResourceId: null,
      durationMinutes: null,
    });
  });

  it('drops a malformed service id, resource id or duration', () => {
    expect(
      parseAvailabilityAlertParams({
        serviceId: 'not-a-uuid',
        preferredResourceId: '<script>',
        durationMinutes: '-5',
      }),
    ).toEqual({ serviceId: null, preferredResourceId: null, durationMinutes: null });
  });

  it('takes the first value of a repeated parameter', () => {
    expect(parseAvailabilityAlertParams({ serviceId: [SERVICE_ID, OTHER_ID] }).serviceId).toBe(
      SERVICE_ID,
    );
  });

  it('round-trips a built link', () => {
    const link = buildAvailabilityAlertLink({
      slug: 'acme',
      services: [eligibleService({ resourceRequirements: [choiceRequirement('STAFF')] })],
      resourceSelections: [pick(SERVICE_ID, RESOURCE_ID)],
      durationMinutes: 60,
    });
    const query = Object.fromEntries(new URL(link ?? '', 'http://x').searchParams);

    expect(parseAvailabilityAlertParams(query)).toEqual({
      serviceId: SERVICE_ID,
      preferredResourceId: RESOURCE_ID,
      durationMinutes: 60,
    });
  });
});
