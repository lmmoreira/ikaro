import { CHATBOT_TIERS, FEATURE_KEYS } from './billing';

describe('billing closed enums', () => {
  it('lists the five sellable features, with recurrence and alerts inside BOOKING', () => {
    expect([...FEATURE_KEYS]).toEqual(['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM']);
  });

  it('lists the two chatbot tiers', () => {
    expect([...CHATBOT_TIERS]).toEqual(['BASIC', 'PLUS']);
  });
});
