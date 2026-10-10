import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { CustomerBuilder } from '../../../../test/builders/customer/index';
import { CustomerEntity } from '../entities/customer.entity';
import { TypeOrmCustomerRepository } from './typeorm-customer.repository';

describe('TypeOrmCustomerRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmCustomerRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmCustomerRepository(dataSource.getRepository(CustomerEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('creates and retrieves a customer — all fields survive the round-trip', async () => {
    const customer = new CustomerBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000010')
      .withGoogleOAuthId('google-sub-m03s01-01')
      .withEmail('joao@lavacar.com.br')
      .withName('João Silva')
      .build();

    await repo.save(customer);

    const found = await repo.findByTenantAndOAuthId(
      '00000000-0000-0000-0000-000000000010',
      'google-sub-m03s01-01',
    );
    expect(found).not.toBeNull();
    expect(found!.id).toBe(customer.id);
    expect(found!.email.address).toBe('joao@lavacar.com.br');
    expect(found!.name).toBe('João Silva');
    expect(found!.phone).toBeNull();
    expect(found!.defaultAddress).toBeNull();
  });

  it('multi-tenant: same googleOAuthId in two tenants — both rows coexist without constraint error', async () => {
    const sharedSub = 'google-sub-m03s01-shared';

    const customerA = new CustomerBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000011')
      .withGoogleOAuthId(sharedSub)
      .withEmail('shared@a.com')
      .build();

    const customerB = new CustomerBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000012')
      .withGoogleOAuthId(sharedSub)
      .withEmail('shared@b.com')
      .build();

    await repo.save(customerA);
    await repo.save(customerB);

    const foundA = await repo.findByTenantAndOAuthId(
      '00000000-0000-0000-0000-000000000011',
      sharedSub,
    );
    const foundB = await repo.findByTenantAndOAuthId(
      '00000000-0000-0000-0000-000000000012',
      sharedSub,
    );

    expect(foundA).not.toBeNull();
    expect(foundB).not.toBeNull();
    expect(foundA!.id).not.toBe(foundB!.id);
    expect(foundA!.tenantId).toBe('00000000-0000-0000-0000-000000000011');
    expect(foundB!.tenantId).toBe('00000000-0000-0000-0000-000000000012');
  });

  it('tenant isolation: findByTenantAndOAuthId returns null for wrong tenant', async () => {
    const customer = new CustomerBuilder()
      .withTenantId('00000000-0000-0000-0000-000000000013')
      .withGoogleOAuthId('google-sub-m03s01-iso')
      .build();
    await repo.save(customer);

    const wrongTenant = await repo.findByTenantAndOAuthId(
      '00000000-0000-0000-0000-000000000099',
      'google-sub-m03s01-iso',
    );
    expect(wrongTenant).toBeNull();
  });

  describe('searchByTenant() against a real database (M23-S39)', () => {
    const SEARCH_TENANT = '00000000-0000-0000-0000-0000000000a1';
    const OTHER_TENANT = '00000000-0000-0000-0000-0000000000a2';

    const clean = () =>
      dataSource
        .getRepository(CustomerEntity)
        .delete([{ tenantId: SEARCH_TENANT }, { tenantId: OTHER_TENANT }]);

    const seed = async (
      tenantId: string,
      sub: string,
      name: string,
      email: string,
      phone: string | null,
    ) =>
      repo.save(
        new CustomerBuilder()
          .withTenantId(tenantId)
          .withGoogleOAuthId(sub)
          .withName(name)
          .withEmail(email)
          .withPhone(phone)
          .build(),
      );

    beforeEach(async () => {
      await clean();
      await seed(SEARCH_TENANT, 'sub-s39-ana', 'Ana Souza', 'ana@example.com', '+5531999998888');
      await seed(
        SEARCH_TENANT,
        'sub-s39-bia',
        'Bia 100% Real',
        'bia@example.com',
        '+5531977776666',
      );
      await seed(SEARCH_TENANT, 'sub-s39-caio', 'Caio Lima', 'caio@example.com', null);
      await seed(OTHER_TENANT, 'sub-s39-dani', 'Dani Souza', 'dani@example.com', '+5531999998888');
    });

    afterAll(clean);

    it('finds a customer by the digits of their phone whatever format is typed', async () => {
      for (const term of ['(31) 99999-8888', '31999998888', '99998888']) {
        const { rows } = await repo.searchByTenant(SEARCH_TENANT, term, 20);
        expect(rows.map((r) => r.name)).toEqual(['Ana Souza']);
        expect(rows[0].phone).toBe('+5531999998888');
      }
    });

    it('returns phone as null for a customer without one', async () => {
      const { rows } = await repo.searchByTenant(SEARCH_TENANT, 'Caio', 20);

      expect(rows).toHaveLength(1);
      expect(rows[0].phone).toBeNull();
    });

    it('still finds a customer by name and by email', async () => {
      expect((await repo.searchByTenant(SEARCH_TENANT, 'souza', 20)).rows).toHaveLength(1);
      expect((await repo.searchByTenant(SEARCH_TENANT, 'caio@example', 20)).rows).toHaveLength(1);
    });

    it('escapes % and _ so they match literally instead of acting as wildcards', async () => {
      expect(
        (await repo.searchByTenant(SEARCH_TENANT, '100%', 20)).rows.map((r) => r.name),
      ).toEqual(['Bia 100% Real']);
      expect((await repo.searchByTenant(SEARCH_TENANT, '%%%%%', 20)).rows).toHaveLength(0);
      expect((await repo.searchByTenant(SEARCH_TENANT, '_____', 20)).rows).toHaveLength(0);
    });

    it('does not match every customer on a term with fewer than 4 digits', async () => {
      const { rows } = await repo.searchByTenant(SEARCH_TENANT, 'zz12', 20);

      expect(rows).toHaveLength(0);
    });

    it("tenant isolation: never returns another tenant's customer, even with the same phone", async () => {
      const { rows, total } = await repo.searchByTenant(SEARCH_TENANT, '99998888', 20);

      expect(rows.map((r) => r.name)).toEqual(['Ana Souza']);
      expect(total).toBe(1);
    });
  });

  it('returns null when customer does not exist', async () => {
    const result = await repo.findByTenantAndOAuthId(
      '00000000-0000-0000-0000-000000000000',
      'google-sub-nonexistent',
    );
    expect(result).toBeNull();
  });
});
