import {
  BillingChargesQuerySchema,
  BillingIdentityUpdateSchema,
  CHATBOT_TIERS,
  FEATURE_KEYS,
  PlanPreviewSchema,
} from './billing';

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

describe('PlanPreviewSchema (M26-S17)', () => {
  const standard = (featureKey: string) => ({ featureKey, tier: 'STANDARD' });

  it('accepts a selection of distinct features at the tiers they are sold in', () => {
    const items = [
      standard('HOTSITE'),
      standard('BOOKING'),
      { featureKey: 'CHATBOT', tier: 'PLUS' },
    ];

    expect(PlanPreviewSchema.parse({ items })).toEqual({ items });
    expect(
      PlanPreviewSchema.parse({ items: [{ featureKey: 'CHATBOT', tier: 'BASIC' }] }).items,
    ).toHaveLength(1);
  });

  it('accepts an empty list: the empty plan is a plan rule (BILLING_PLAN_EMPTY), not a shape error', () => {
    expect(PlanPreviewSchema.parse({ items: [] })).toEqual({ items: [] });
  });

  it.each([
    ['a feature selected twice', { items: [standard('HOTSITE'), standard('HOTSITE')] }],
    ['the chatbot at STANDARD', { items: [standard('CHATBOT')] }],
    ['a single-tier feature at PLUS', { items: [{ featureKey: 'BOOKING', tier: 'PLUS' }] }],
    ['an unknown feature', { items: [standard('NOPE')] }],
    ['an unknown tier', { items: [{ featureKey: 'CHATBOT', tier: 'GOLD' }] }],
    ['no items', {}],
    ['items that is not a list', { items: 'HOTSITE' }],
    [
      'more items than there are features',
      { items: [...FEATURE_KEYS, 'HOTSITE'].map((featureKey) => standard(featureKey)) },
    ],
  ])('rejects %s', (_label, body) => {
    expect(() => PlanPreviewSchema.parse(body)).toThrow();
  });
});

describe('billing closed enums', () => {
  it('lists the five sellable features, with recurrence and alerts inside BOOKING', () => {
    expect([...FEATURE_KEYS]).toEqual(['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM']);
  });

  it('lists the two chatbot tiers', () => {
    expect([...CHATBOT_TIERS]).toEqual(['BASIC', 'PLUS']);
  });
});

describe('BillingIdentityUpdateSchema (M26-S16)', () => {
  it('accepts an empty body: every field is optional', () => {
    expect(BillingIdentityUpdateSchema.parse({})).toEqual({});
  });

  it('keeps an alphanumeric CNPJ as typed, punctuation and letters included', () => {
    const body = { taxIdType: 'CNPJ', taxId: '12.ABC.345/01DE-35' };
    expect(BillingIdentityUpdateSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['null', null],
    ['a blank string', ''],
  ])(
    'accepts %s for taxId, legalName and billingEmail: a clear request for the backend',
    (_l, v) => {
      const body = { taxId: v, legalName: v, billingEmail: v };
      expect(BillingIdentityUpdateSchema.parse(body)).toEqual(body);
    },
  );

  it('accepts a partial address and a null complement', () => {
    const body = { address: { city: 'Belo Horizonte', complement: null } };
    expect(BillingIdentityUpdateSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['a taxIdType without a taxId', { taxIdType: 'CPF' }],
    ['a taxIdType beside a null taxId', { taxIdType: 'CPF', taxId: null }],
    ['a taxIdType beside a blank taxId', { taxIdType: 'EIN', taxId: '  ' }],
    ['an unknown taxIdType', { taxIdType: 'SSN', taxId: '123' }],
    ['a null address (an address is never cleared)', { address: null }],
    ['a taxId over 64 characters', { taxId: 'A'.repeat(65) }],
    ['an address field that is not a string', { address: { street: 12 } }],
  ])('rejects %s', (_label, body) => {
    expect(() => BillingIdentityUpdateSchema.parse(body)).toThrow();
  });

  it('accepts a taxIdType null beside a taxId: the type is inferred', () => {
    expect(BillingIdentityUpdateSchema.parse({ taxIdType: null, taxId: '529.982.247-25' })).toEqual(
      { taxIdType: null, taxId: '529.982.247-25' },
    );
  });
});
