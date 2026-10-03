import { QuoteServiceDurationSchema } from './quote-service-duration.dto';

describe('QuoteServiceDurationSchema', () => {
  it('coerces the query-string duration to a positive integer', () => {
    expect(QuoteServiceDurationSchema.parse({ durationMinutes: '90' })).toEqual({
      durationMinutes: 90,
    });
  });

  it('keeps the duration optional — the domain decides whether a service needs one', () => {
    expect(QuoteServiceDurationSchema.parse({})).toEqual({});
  });

  it.each(['0', '-15', '1.5', 'abc'])('rejects %j', (durationMinutes) => {
    expect(QuoteServiceDurationSchema.safeParse({ durationMinutes }).success).toBe(false);
  });
});
