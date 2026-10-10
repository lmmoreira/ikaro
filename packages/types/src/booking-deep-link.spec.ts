import { buildBookingDeepLinkUrl, parseBookingDeepLink } from './booking-deep-link';

const SERVICE_ID = '10000000-0000-4000-8000-000000000001';
const RESOURCE_ID = '20000000-0000-4000-8000-000000000001';
const HOTSITE = 'https://app.ikaro.test/lavacar';

const queryOf = (url: string) => new URL(url).searchParams;

describe('buildBookingDeepLinkUrl()', () => {
  it('opens the booking page on the service and the day', () => {
    const url = buildBookingDeepLinkUrl(HOTSITE, { serviceId: SERVICE_ID, date: '2030-03-04' });

    expect(url).toBe(`${HOTSITE}/booking?serviceId=${SERVICE_ID}&date=2030-03-04`);
  });

  it('carries the duration and the resource when the alert has them', () => {
    const url = buildBookingDeepLinkUrl(HOTSITE, {
      serviceId: SERVICE_ID,
      date: '2030-03-04',
      durationMinutes: 90,
      resourceId: RESOURCE_ID,
    });

    const query = queryOf(url);
    expect(query.get('durationMinutes')).toBe('90');
    expect(query.get('resourceId')).toBe(RESOURCE_ID);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('leaves out a duration and a resource that are %s', (_label, absent) => {
    const url = buildBookingDeepLinkUrl(HOTSITE, {
      serviceId: SERVICE_ID,
      date: '2030-03-04',
      durationMinutes: absent,
      resourceId: absent,
    });

    expect(queryOf(url).has('durationMinutes')).toBe(false);
    expect(queryOf(url).has('resourceId')).toBe(false);
  });

  it('stays empty when there is no hotsite URL, never a relative link', () => {
    expect(buildBookingDeepLinkUrl('', { serviceId: SERVICE_ID, date: '2030-03-04' })).toBe('');
  });
});

describe('parseBookingDeepLink()', () => {
  it('reads back every piece the builder wrote (round trip)', () => {
    const url = buildBookingDeepLinkUrl(HOTSITE, {
      serviceId: SERVICE_ID,
      date: '2030-03-04',
      durationMinutes: 90,
      resourceId: RESOURCE_ID,
    });

    expect(parseBookingDeepLink(queryOf(url))).toEqual({
      serviceId: SERVICE_ID,
      date: '2030-03-04',
      durationMinutes: 90,
      resourceId: RESOURCE_ID,
    });
  });

  it('round-trips a link with only a service and a day', () => {
    const url = buildBookingDeepLinkUrl(HOTSITE, { serviceId: SERVICE_ID, date: '2030-03-04' });

    expect(parseBookingDeepLink(queryOf(url))).toEqual({
      serviceId: SERVICE_ID,
      date: '2030-03-04',
      durationMinutes: null,
      resourceId: null,
    });
  });

  it.each([
    ['no query at all', ''],
    ['a service that is not a UUID', 'serviceId=not-a-uuid'],
    ['an empty service', 'serviceId='],
    ['only a date', 'date=2030-03-04'],
  ])('is not a deep link with %s', (_label, search) => {
    expect(parseBookingDeepLink(new URLSearchParams(search))).toBeNull();
  });

  it.each([
    ['an impossible date', 'date=2030-02-30'],
    ['a malformed date', 'date=04-03-2030'],
    ['a date-time', 'date=2030-03-04T10:00'],
  ])('drops %s but keeps the service', (_label, extra) => {
    const link = parseBookingDeepLink(new URLSearchParams(`serviceId=${SERVICE_ID}&${extra}`));

    expect(link?.date).toBeNull();
    expect(link?.serviceId).toBe(SERVICE_ID);
  });

  it.each(['0', '-30', '1.5', 'abc', '9007199254740993', ''])(
    'drops the duration %j',
    (minutes) => {
      const link = parseBookingDeepLink(
        new URLSearchParams(`serviceId=${SERVICE_ID}&durationMinutes=${minutes}`),
      );

      expect(link?.durationMinutes).toBeNull();
    },
  );

  it('drops a resource that is not a UUID', () => {
    const link = parseBookingDeepLink(
      new URLSearchParams(`serviceId=${SERVICE_ID}&resourceId=staff-1`),
    );

    expect(link?.resourceId).toBeNull();
  });
});
