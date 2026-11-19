import { CHATBOT_TIERS, FEATURE_KEYS, ProviderWebhookBodySchema } from './billing';

describe('billing closed enums', () => {
  it('lists the five sellable features, with recurrence and alerts inside BOOKING', () => {
    expect([...FEATURE_KEYS]).toEqual(['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM']);
  });

  it('lists the two chatbot tiers', () => {
    expect([...CHATBOT_TIERS]).toEqual(['BASIC', 'PLUS']);
  });

  describe('ProviderWebhookBodySchema', () => {
    it('accepts any JSON object, whatever its fields', () => {
      expect(
        ProviderWebhookBodySchema.safeParse({ id: 'evt_1', payment: { id: 'pay_1' } }).success,
      ).toBe(true);
      expect(ProviderWebhookBodySchema.safeParse({}).success).toBe(true);
    });

    it.each([[[]], ['text'], [42], [null]])('refuses %p: a webhook body is an object', (body) => {
      expect(ProviderWebhookBodySchema.safeParse(body).success).toBe(false);
    });
  });
});
