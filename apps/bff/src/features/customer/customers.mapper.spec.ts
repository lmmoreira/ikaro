import { toTenantOption } from './customers.mapper';

describe('toTenantOption', () => {
  const tenant = { tenantId: 'tid-1', customerId: 'cid-1' };
  const tenantInfo = { id: 'tid-1', slug: 'lavacar-bh', name: 'Lavacar BH', locale: 'pt-BR' };
  const balance = { currentPoints: 120 };

  it('maps tenant summary + tenant info + balance to a TenantOption', () => {
    const result = toTenantOption(tenant, tenantInfo, balance);

    expect(result).toEqual({
      id: 'tid-1',
      name: 'Lavacar BH',
      slug: 'lavacar-bh',
      loyaltyPoints: 120,
    });
  });

  it('uses tenantId (not customerId) as the option id', () => {
    const result = toTenantOption(
      { tenantId: 'tid-abc', customerId: 'cid-xyz' },
      { id: 'tid-abc', slug: 'test', name: 'Test', locale: 'pt-BR' },
      { currentPoints: 0 },
    );
    expect(result.id).toBe('tid-abc');
  });

  it('reflects the balance current points as loyaltyPoints', () => {
    const result = toTenantOption(tenant, tenantInfo, { currentPoints: 0 });
    expect(result.loyaltyPoints).toBe(0);
  });
});
