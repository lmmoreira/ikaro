import { ProvisionTenantSchema } from './provision-tenant.dto';

const BASE = {
  name: 'Lavacar',
  slug: 'lavacar',
  adminEmail: 'admin@lavacar.com.br',
  country_code: 'BR',
};
const REGISTRATION_ID = '0198f1c2-7a3b-7c4d-8e5f-0123456789ab';

const parse = (extra: Record<string, unknown>) =>
  ProvisionTenantSchema.safeParse({ ...BASE, ...extra });

describe('ProvisionTenantSchema — billing inputs', () => {
  it('accepts the legacy body without any billing field', () => {
    expect(parse({}).success).toBe(true);
  });

  it('accepts exempt, a registrationId, a taxId and a closed feature subset', () => {
    const result = parse({
      registrationId: REGISTRATION_ID,
      taxId: '529.982.247-25',
      features: ['HOTSITE', 'BOOKING', 'LOYALTY'],
    });

    expect(result.success).toBe(true);
  });

  it('accepts an exempt tenant on its own', () => {
    expect(parse({ exempt: true }).success).toBe(true);
  });

  it.each([
    ['HOTSITE'],
    ['HOTSITE', 'BOOKING'],
    ['HOTSITE', 'CHATBOT'],
    ['HOTSITE', 'LEAD_FORM'],
    ['HOTSITE', 'BOOKING', 'LOYALTY', 'CHATBOT', 'LEAD_FORM'],
    ['LEAD_FORM', 'HOTSITE'],
  ])('accepts the closed subset %j', (...features) => {
    expect(parse({ features }).success).toBe(true);
  });

  it.each([
    ['an empty subset', []],
    ['a repeated feature', ['HOTSITE', 'HOTSITE']],
    ['an unknown feature key', ['HOTSITE', 'TELEPORT']],
    ['BOOKING without HOTSITE', ['BOOKING']],
    ['LOYALTY without BOOKING', ['HOTSITE', 'LOYALTY']],
    ['CHATBOT without HOTSITE', ['CHATBOT']],
    ['LEAD_FORM without HOTSITE', ['LEAD_FORM', 'BOOKING']],
  ])('refuses %s', (_label, features) => {
    expect(parse({ features }).success).toBe(false);
  });

  it('refuses a registrationId that is not a UUID', () => {
    expect(parse({ registrationId: 'not-a-uuid' }).success).toBe(false);
  });

  it('refuses exempt together with a registrationId', () => {
    const result = parse({ exempt: true, registrationId: REGISTRATION_ID });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['registrationId']);
  });

  it('allows exempt: false together with a registrationId', () => {
    expect(parse({ exempt: false, registrationId: REGISTRATION_ID }).success).toBe(true);
  });

  it('does not judge the tax id (the use case validates it per country)', () => {
    expect(parse({ taxId: 'anything' }).success).toBe(true);
  });
});
