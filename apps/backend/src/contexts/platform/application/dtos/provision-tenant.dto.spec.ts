import { TEST_REGISTRATION_ID } from '../../../../test/utils/test-registration-id';
import { ProvisionTenantSchema } from './provision-tenant.dto';

const BASE = {
  name: 'Lavacar',
  slug: 'lavacar',
  adminEmail: 'admin@lavacar.com.br',
  country_code: 'BR',
  registrationId: TEST_REGISTRATION_ID,
};

const parse = (overrides: Record<string, unknown>) =>
  ProvisionTenantSchema.safeParse({ ...BASE, ...overrides });

describe('ProvisionTenantSchema — registrationId', () => {
  it('accepts a complete body with a UUID registrationId', () => {
    expect(parse({}).success).toBe(true);
  });

  it('refuses a body without a registrationId', () => {
    const result = ProvisionTenantSchema.safeParse({
      name: BASE.name,
      slug: BASE.slug,
      adminEmail: BASE.adminEmail,
      country_code: BASE.country_code,
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['registrationId']);
  });

  it.each([['not-a-uuid'], [''], [42], [null]])(
    'refuses a registrationId that is not a UUID (%j)',
    (registrationId) => {
      expect(parse({ registrationId }).success).toBe(false);
    },
  );

  it('does not judge billing data: a tax id, exempt flag or feature list are not part of the schema', () => {
    const result = parse({ taxId: '529.982.247-25', exempt: true, features: ['HOTSITE'] });

    expect(result.success).toBe(true);
    // zod strips unknown keys: nothing billing-related reaches the use case
    expect(result.data).toEqual(BASE);
  });
});
