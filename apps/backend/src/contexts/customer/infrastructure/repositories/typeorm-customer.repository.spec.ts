import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { Customer } from '../../domain/customer.aggregate';
import { CustomerEntity } from '../entities/customer.entity';
import { TypeOrmCustomerRepository } from './typeorm-customer.repository';

describe('TypeOrmCustomerRepository', () => {
  let repo: TypeOrmCustomerRepository;
  let ormRepo: jest.Mocked<Repository<CustomerEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmCustomerRepository,
        {
          provide: getRepositoryToken(CustomerEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmCustomerRepository);
    ormRepo = moduleRef.get(getRepositoryToken(CustomerEntity));
  });

  it('findByTenantAndOAuthId returns null when no row found', async () => {
    ormRepo.findOne.mockResolvedValue(null);
    const result = await repo.findByTenantAndOAuthId('tenant-1', 'sub-1');
    expect(result).toBeNull();
  });

  it('findByTenantAndOAuthId maps entity to domain aggregate with VO-typed fields', async () => {
    const entity = new CustomerEntityBuilder()
      .withTenantId('tenant-1')
      .withGoogleOAuthId('google-sub-1')
      .withEmail('user@example.com')
      .build();
    ormRepo.findOne.mockResolvedValue(entity);

    const result = await repo.findByTenantAndOAuthId('tenant-1', 'google-sub-1');

    expect(result).toBeInstanceOf(Customer);
    expect(result!.email.address).toBe('user@example.com');
    expect(result!.tenantId).toBe('tenant-1');
    expect(result!.phone).toBeNull();
    expect(result!.defaultAddress).toBeNull();
  });

  it('findById returns null when no row found', async () => {
    ormRepo.findOne.mockResolvedValue(null);
    const result = await repo.findById('some-id', 'tenant-1');
    expect(result).toBeNull();
  });

  it('findById returns null when row exists but belongs to a different tenant', async () => {
    ormRepo.findOne.mockResolvedValue(null);
    const result = await repo.findById('some-id', 'tenant-other');
    expect(result).toBeNull();
  });

  it('findById maps entity to domain aggregate', async () => {
    const entity = new CustomerEntityBuilder()
      .withTenantId('tenant-1')
      .withGoogleOAuthId('google-sub-2')
      .withEmail('bob@example.com')
      .build();
    ormRepo.findOne.mockResolvedValue(entity);

    const result = await repo.findById(entity.id, 'tenant-1');

    expect(result).toBeInstanceOf(Customer);
    expect(result!.tenantId).toBe('tenant-1');
    expect(result!.googleOAuthId).toBe('google-sub-2');
  });

  it('save maps domain to entity and calls repo.save with string fields', async () => {
    ormRepo.save.mockResolvedValue(new CustomerEntityBuilder().build());
    const customer = Customer.create('tenant-1', 'sub-1', 'a@b.com', 'Maria');
    await repo.save(customer);
    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com', tenantId: 'tenant-1' }),
    );
  });

  describe('searchByTenant()', () => {
    const entity = new CustomerEntityBuilder()
      .withTenantId('tenant-1')
      .withEmail('joao@example.com')
      .withName('João Silva')
      .withPhone('+5531999999999')
      .build();

    // A chainable query-builder double that records the search clauses, plus the inner builder
    // handed to the Brackets callback.
    function mockQueryBuilder(result: [CustomerEntity[], number]) {
      const inner = { where: jest.fn(), orWhere: jest.fn() };
      inner.where.mockReturnValue(inner);
      inner.orWhere.mockReturnValue(inner);
      const qb = {
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        take: jest.fn(),
        getManyAndCount: jest.fn().mockResolvedValue(result),
      };
      qb.where.mockReturnValue(qb);
      qb.andWhere.mockReturnValue(qb);
      qb.orderBy.mockReturnValue(qb);
      qb.take.mockReturnValue(qb);
      (ormRepo.createQueryBuilder as jest.Mock).mockReturnValue(qb);
      const runSearchClause = () => {
        const brackets = qb.andWhere.mock.calls[0][0] as Brackets;
        (brackets as unknown as { whereFactory: (b: unknown) => void }).whereFactory(inner);
      };
      return { qb, inner, runSearchClause };
    }

    it('returns rows, total and the phone, scoped to the tenant', async () => {
      const { qb } = mockQueryBuilder([[entity], 1]);

      const result = await repo.searchByTenant('tenant-1', 'João', 20);

      expect(qb.where).toHaveBeenCalledWith('c.tenantId = :tenantId', { tenantId: 'tenant-1' });
      expect(qb.orderBy).toHaveBeenCalledWith('c.name', 'ASC');
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result.total).toBe(1);
      expect(result.rows[0]).toEqual({
        customerId: entity.id,
        name: 'João Silva',
        email: 'joao@example.com',
        phone: '+5531999999999',
      });
    });

    it('adds no search clause when search is undefined', async () => {
      const { qb } = mockQueryBuilder([[entity], 1]);

      await repo.searchByTenant('tenant-1', undefined, 10);

      expect(qb.andWhere).not.toHaveBeenCalled();
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('returns empty rows and zero total when no customers match', async () => {
      mockQueryBuilder([[], 0]);

      const result = await repo.searchByTenant('tenant-1', 'zzz', 20);

      expect(result.rows).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('escapes LIKE wildcards in the name and email term', async () => {
      const { inner, runSearchClause } = mockQueryBuilder([[], 0]);

      await repo.searchByTenant('tenant-1', '50%_off', 20);
      runSearchClause();

      expect(inner.where).toHaveBeenCalledWith('c.name ILIKE :term', { term: '%50\\%\\_off%' });
      expect(inner.orWhere).toHaveBeenCalledWith('c.email ILIKE :term', {
        term: '%50\\%\\_off%',
      });
    });

    it('matches the phone on its digits when the term has at least 4 digits', async () => {
      const { inner, runSearchClause } = mockQueryBuilder([[], 0]);

      await repo.searchByTenant('tenant-1', '(31) 99999-9999', 20);
      runSearchClause();

      expect(inner.orWhere).toHaveBeenCalledWith(
        expect.stringContaining("regexp_replace(c.phone, '\\D', '', 'g') LIKE :digits"),
        { digits: '%31999999999%' },
      );
    });

    // Negative guarantee: a term with no digits must not become an empty pattern that matches
    // every customer.
    it.each(['Maria', 'ab@c.', '(31) x'])(
      'leaves the phone clause out for the term "%s" (under 4 digits)',
      async (term) => {
        const { inner, runSearchClause } = mockQueryBuilder([[], 0]);

        await repo.searchByTenant('tenant-1', term, 20);
        runSearchClause();

        expect(inner.orWhere).toHaveBeenCalledTimes(1);
        expect(inner.orWhere).toHaveBeenCalledWith('c.email ILIKE :term', expect.anything());
      },
    );
  });
});
