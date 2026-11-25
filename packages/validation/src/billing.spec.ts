import { BillingChargesQuerySchema, CHATBOT_TIERS, FEATURE_KEYS } from './billing';

describe('BillingChargesQuerySchema', () => {
  it('defaults to limit 25 and offset 0 and coerces query strings', () => {
    expect(BillingChargesQuerySchema.parse({})).toEqual({ limit: 25, offset: 0 });
    expect(BillingChargesQuerySchema.parse({ limit: '10', offset: '20' })).toEqual({
      limit: 10,
      offset: 20,
    });
  });

  it.each([{ limit: '0' }, { limit: '101' }, { limit: '-1' }, { offset: '-1' }, { limit: 'x' }])(
    'rejects %j',
    (query) => {
      expect(() => BillingChargesQuerySchema.parse(query)).toThrow();
    },
  );
});

describe('billing closed enums', () => {
  it('lists the five sellable features, with recurrence and alerts inside BOOKING', () => {
    expect([...FEATURE_KEYS]).toEqual(['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM']);
  });

  it('lists the two chatbot tiers', () => {
    expect([...CHATBOT_TIERS]).toEqual(['BASIC', 'PLUS']);
  });
});
