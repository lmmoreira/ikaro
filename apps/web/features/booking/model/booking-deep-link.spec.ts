import { describe, expect, it } from 'vitest';
import type { BookingDeepLink, HotsiteServiceResourceOptionsRequirement } from '@ikaro/types';
import { choiceRequirement, makeHotsiteService } from '@/test-utils';
import { resolveBookingDeepLinkSeed, seededResourcePick } from './booking-deep-link';

const SERVICE_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_SERVICE_ID = '10000000-0000-4000-8000-000000000002';
const RESOURCE_ID = '20000000-0000-4000-8000-000000000001';

// 2026-06-15 12:00 UTC; "today" in America/Sao_Paulo is the same day.
const NOW = new Date('2026-06-15T12:00:00.000Z');
const CONTEXT = { maxBookingAdvanceDays: 30, timezone: 'America/Sao_Paulo', now: NOW };

const fixedService = makeHotsiteService({ id: SERVICE_ID });
const variableService = makeHotsiteService({
  id: SERVICE_ID,
  bookingPolicy: {
    ...makeHotsiteService().bookingPolicy,
    durationPolicy: 'CUSTOMER_SELECTED',
    durationMinMinutes: 60,
    durationMaxMinutes: 120,
    durationIncrementMinutes: 30,
  },
});

const params = (overrides: Partial<BookingDeepLink> = {}): BookingDeepLink => ({
  serviceId: SERVICE_ID,
  date: null,
  durationMinutes: null,
  resourceId: null,
  ...overrides,
});

describe('resolveBookingDeepLinkSeed()', () => {
  it('seeds the service, the day and the resource of a fixed-duration service', () => {
    expect(
      resolveBookingDeepLinkSeed(
        params({ date: '2026-06-20', resourceId: RESOURCE_ID }),
        [fixedService],
        CONTEXT,
      ),
    ).toEqual({
      serviceId: SERVICE_ID,
      date: '2026-06-20',
      durationMinutes: null,
      resourceId: RESOURCE_ID,
    });
  });

  it('is no seed without a link, the plain booking page', () => {
    expect(resolveBookingDeepLinkSeed(null, [fixedService], CONTEXT)).toBeNull();
  });

  it('is no seed for a service the page does not offer (unknown, deactivated, another tenant)', () => {
    expect(
      resolveBookingDeepLinkSeed(params({ serviceId: OTHER_SERVICE_ID }), [fixedService], CONTEXT),
    ).toBeNull();
    expect(resolveBookingDeepLinkSeed(params(), [], CONTEXT)).toBeNull();
  });

  describe('the day', () => {
    it.each([
      ['yesterday', '2026-06-14'],
      ['past the last bookable day', '2026-07-15'],
    ])('is dropped when it is %s, keeping the service', (_label, date) => {
      const seed = resolveBookingDeepLinkSeed(params({ date }), [fixedService], CONTEXT);

      expect(seed).toMatchObject({ serviceId: SERVICE_ID, date: null });
    });

    it.each(['2026-06-15', '2026-07-14'])('keeps %s, the first and last bookable days', (date) => {
      expect(resolveBookingDeepLinkSeed(params({ date }), [fixedService], CONTEXT)?.date).toBe(
        date,
      );
    });

    it('uses the tenant’s today, not the UTC one, near midnight', () => {
      // 02:00 UTC on the 16th is still the 15th in São Paulo.
      const lateNight = { ...CONTEXT, now: new Date('2026-06-16T02:00:00.000Z') };

      const seed = resolveBookingDeepLinkSeed(
        params({ date: '2026-06-15' }),
        [fixedService],
        lateNight,
      );

      expect(seed?.date).toBe('2026-06-15');
    });

    it('follows the service’s own tighter window over the tenant’s', () => {
      const tight = makeHotsiteService({
        id: SERVICE_ID,
        bookingPolicy: {
          ...makeHotsiteService().bookingPolicy,
          effectiveMaxBookingAdvanceDays: 5,
        },
      });

      expect(
        resolveBookingDeepLinkSeed(params({ date: '2026-06-25' }), [tight], CONTEXT)?.date,
      ).toBeNull();
      expect(
        resolveBookingDeepLinkSeed(params({ date: '2026-06-19' }), [tight], CONTEXT)?.date,
      ).toBe('2026-06-19');
    });

    it('skips the days inside the service’s minimum notice', () => {
      const notice = makeHotsiteService({
        id: SERVICE_ID,
        bookingPolicy: {
          ...makeHotsiteService().bookingPolicy,
          effectiveMinBookingAdvanceHours: 48,
        },
      });

      expect(
        resolveBookingDeepLinkSeed(params({ date: '2026-06-16' }), [notice], CONTEXT)?.date,
      ).toBeNull();
      expect(
        resolveBookingDeepLinkSeed(params({ date: '2026-06-17' }), [notice], CONTEXT)?.date,
      ).toBe('2026-06-17');
    });
  });

  describe('a customer-selected-duration service', () => {
    it('seeds a duration the service offers, together with the day', () => {
      expect(
        resolveBookingDeepLinkSeed(
          params({ date: '2026-06-20', durationMinutes: 90 }),
          [variableService],
          CONTEXT,
        ),
      ).toMatchObject({ durationMinutes: 90, date: '2026-06-20' });
    });

    it.each([45, 150, 30])('drops %d minutes, outside the service’s steps', (minutes) => {
      const seed = resolveBookingDeepLinkSeed(
        params({ date: '2026-06-20', durationMinutes: minutes }),
        [variableService],
        CONTEXT,
      );

      expect(seed?.durationMinutes).toBeNull();
    });

    it('drops the day with an unusable duration: choosing the duration would clear it anyway', () => {
      const seed = resolveBookingDeepLinkSeed(
        params({ date: '2026-06-20', durationMinutes: 45 }),
        [variableService],
        CONTEXT,
      );

      expect(seed).toMatchObject({ serviceId: SERVICE_ID, date: null, durationMinutes: null });
    });
  });

  it('ignores a duration on a fixed-duration service', () => {
    const seed = resolveBookingDeepLinkSeed(
      params({ date: '2026-06-20', durationMinutes: 90 }),
      [fixedService],
      CONTEXT,
    );

    expect(seed).toMatchObject({ durationMinutes: null, date: '2026-06-20' });
  });

  it.each([
    [
      'a bundle',
      makeHotsiteService({
        id: SERVICE_ID,
        resourceRequirements: [choiceRequirement('STAFF'), choiceRequirement('ROOM')],
      }),
    ],
    [
      'a legged service',
      makeHotsiteService({
        id: SERVICE_ID,
        legs: [
          {
            legIndex: 0,
            name: 'Sauna',
            durationMinutes: 20,
            transitionGapAfterMinutes: 0,
            resourceRequirements: [choiceRequirement('STAFF')],
          },
        ],
      }),
    ],
  ])('seeds no resource on %s', (_label, service) => {
    expect(
      resolveBookingDeepLinkSeed(params({ resourceId: RESOURCE_ID }), [service], CONTEXT)
        ?.resourceId,
    ).toBeNull();
  });
});

describe('seededResourcePick()', () => {
  const requirement = (
    overrides: Partial<HotsiteServiceResourceOptionsRequirement> = {},
  ): HotsiteServiceResourceOptionsRequirement => ({
    serviceId: SERVICE_ID,
    legIndex: null,
    resourceType: 'STAFF',
    selectionMode: 'CUSTOMER_CHOICE',
    requiredQuantity: 1,
    options: [{ resourceId: RESOURCE_ID, name: 'Ana' }],
    ...overrides,
  });

  it('is the pick for the requirement that offers the resource', () => {
    expect(seededResourcePick([requirement()], SERVICE_ID, RESOURCE_ID)).toEqual({
      serviceId: SERVICE_ID,
      legIndex: null,
      resourceType: 'STAFF',
      resourceId: RESOURCE_ID,
    });
  });

  it('is nothing when the service no longer offers the resource', () => {
    const gone = requirement({ options: [{ resourceId: OTHER_SERVICE_ID, name: 'Bia' }] });

    expect(seededResourcePick([gone], SERVICE_ID, RESOURCE_ID)).toBeNull();
  });

  it('is nothing for another service’s requirement, or for a leg’s', () => {
    expect(
      seededResourcePick([requirement({ serviceId: OTHER_SERVICE_ID })], SERVICE_ID, RESOURCE_ID),
    ).toBeNull();
    expect(seededResourcePick([requirement({ legIndex: 1 })], SERVICE_ID, RESOURCE_ID)).toBeNull();
  });

  it('is nothing when the service has more than one requirement to pick', () => {
    expect(
      seededResourcePick(
        [requirement(), requirement({ resourceType: 'ROOM' })],
        SERVICE_ID,
        RESOURCE_ID,
      ),
    ).toBeNull();
  });
});
