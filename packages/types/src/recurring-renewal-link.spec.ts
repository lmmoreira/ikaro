import {
  buildRecurringRenewalUrl,
  parseRecurringRenewalLink,
  RECURRING_RENEWAL_PATH,
} from './recurring-renewal-link';

const SCHEDULE_ID = '10000000-0000-4000-8000-000000000001';
const HOTSITE = 'https://app.ikaro.test/lavacar';

describe('buildRecurringRenewalUrl()', () => {
  it('opens the new-reservation page pre-filled from the schedule', () => {
    expect(buildRecurringRenewalUrl(HOTSITE, SCHEDULE_ID)).toBe(
      `${HOTSITE}${RECURRING_RENEWAL_PATH}?renewFrom=${SCHEDULE_ID}`,
    );
  });

  it('keeps an empty hotsite URL empty instead of building a relative link', () => {
    expect(buildRecurringRenewalUrl('', SCHEDULE_ID)).toBe('');
  });
});

describe('parseRecurringRenewalLink()', () => {
  it('reads back the schedule id of a built link', () => {
    const url = new URL(buildRecurringRenewalUrl(HOTSITE, SCHEDULE_ID));

    expect(parseRecurringRenewalLink(url.searchParams)).toBe(SCHEDULE_ID);
  });

  it.each([
    ['absent', ''],
    ['empty', 'renewFrom='],
    ['not an id', 'renewFrom=not-an-id'],
  ])('is null when the parameter is %s', (_label, search) => {
    expect(parseRecurringRenewalLink(new URLSearchParams(search))).toBeNull();
  });
});
