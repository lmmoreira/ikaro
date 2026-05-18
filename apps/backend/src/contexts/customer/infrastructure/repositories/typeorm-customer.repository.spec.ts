import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
});
