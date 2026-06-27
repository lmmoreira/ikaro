import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ServiceEntityBuilder } from '../../../../test/builders/booking/index';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { TENANT_SETTINGS_PORT } from '../../../../shared/ports/tenant-settings.port';
import { Money } from '../../../../shared/value-objects/money';
import { Service } from '../../domain/service.aggregate';
import { ServiceEntity } from '../entities/service.entity';
import { TypeOrmServiceRepository } from './typeorm-service.repository';

describe('TypeOrmServiceRepository', () => {
  let repo: TypeOrmServiceRepository;
  let ormRepo: jest.Mocked<Repository<ServiceEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmServiceRepository,
        {
          provide: getRepositoryToken(ServiceEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
          },
        },
        { provide: TENANT_SETTINGS_PORT, useClass: InMemoryTenantSettingsPort },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmServiceRepository);
    ormRepo = moduleRef.get(getRepositoryToken(ServiceEntity));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('findById returns null when not found', async () => {
    ormRepo.findOne.mockResolvedValue(null);
    const result = await repo.findById('some-id', 'tenant-1');
    expect(result).toBeNull();
  });

  it('findById maps entity to domain aggregate with Money VO', async () => {
    const entity = new ServiceEntityBuilder()
      .withTenantId('tenant-1')
      .withName('Lavagem Completa')
      .withPriceAmount('150.00')
      .withDurationMinutes(60)
      .withIsActive(true)
      .build();
    ormRepo.findOne.mockResolvedValue(entity);

    const result = await repo.findById(entity.id, 'tenant-1');

    expect(result).toBeInstanceOf(Service);
    expect(result!.tenantId).toBe('tenant-1');
    expect(result!.name).toBe('Lavagem Completa');
    expect(result!.price).toBeInstanceOf(Money);
    expect(result!.price.amount.toNumber()).toBe(150);
    expect(result!.price.currency).toBe('BRL');
    expect(result!.durationMinutes).toBe(60);
    expect(result!.isActive).toBe(true);
  });

  it('findAllByTenant returns all services for tenant when status is ANY', async () => {
    const entities = [
      new ServiceEntityBuilder().withId('id-1').withTenantId('tenant-1').withIsActive(true).build(),
      new ServiceEntityBuilder()
        .withId('id-2')
        .withTenantId('tenant-1')
        .withIsActive(false)
        .build(),
    ];
    const query = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(entities),
    };
    ormRepo.createQueryBuilder.mockReturnValue(query as never);

    const result = await repo.findAllByTenant('tenant-1', { status: 'ANY' });

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(Service);
    expect(query.where).toHaveBeenCalledWith('service.tenantId = :tenantId', {
      tenantId: 'tenant-1',
    });
  });

  it('findAllByTenant filters by isActive=true when status is ACTIVE', async () => {
    const query = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    ormRepo.createQueryBuilder.mockReturnValue(query as never);

    await repo.findAllByTenant('tenant-1', { status: 'ACTIVE' });

    expect(query.andWhere).toHaveBeenCalledWith('service.isActive = :isActive', {
      isActive: true,
    });
  });

  it('save maps domain to entity — price stored as fixed-point string', async () => {
    ormRepo.save.mockResolvedValue(new ServiceEntityBuilder().build());
    const service = Service.create('tenant-1', 'Lavagem', Money.from(150, 'BRL'), 60, 10);

    await repo.save(service);

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        name: 'Lavagem',
        priceAmount: '150.00',
        durationMinutes: 60,
        loyaltyPointsValue: 10,
      }),
    );
  });

  it('price.format() returns pt-BR format after round-trip through entity mapper', async () => {
    const entity = new ServiceEntityBuilder().withPriceAmount('150.00').build();
    ormRepo.findOne.mockResolvedValue(entity);

    const result = await repo.findById(entity.id, entity.tenantId);

    expect(result!.price.format('pt-BR')).toBe('R$\u00A0150,00');
  });
});
