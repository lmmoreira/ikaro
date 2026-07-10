import { GetCustomerTenantsSchema } from './get-customer-tenants.dto';

describe('GetCustomerTenantsSchema', () => {
  it('accepts a non-empty googleOAuthId', () => {
    const result = GetCustomerTenantsSchema.safeParse({ googleOAuthId: 'google-sub-123' });

    expect(result.success).toBe(true);
  });

  it('rejects a missing googleOAuthId', () => {
    const result = GetCustomerTenantsSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it('rejects an empty googleOAuthId', () => {
    const result = GetCustomerTenantsSchema.safeParse({ googleOAuthId: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a whitespace-only googleOAuthId', () => {
    const result = GetCustomerTenantsSchema.safeParse({ googleOAuthId: '   ' });

    expect(result.success).toBe(false);
  });
});
