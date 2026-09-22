import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import {
  ServiceBuilder,
  ServiceEntityBuilder,
  ServiceResourceRequirementEntityBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { TENANT_SETTINGS_PORT } from '../../../../shared/ports/tenant-settings.port';
import { Money } from '../../../../shared/value-objects/money';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { Service } from '../../domain/service.aggregate';
import { ServiceResourceRequirementEntity } from '../entities/service-resource-requirement.entity';
import { ServiceEntity } from '../entities/service.entity';
import { TypeOrmServiceRepository } from './typeorm-service.repository';

describe('TypeOrmServiceRepository', () => {
  let repo: TypeOrmServiceRepository;
  let ormRepo: jest.Mocked<Repository<ServiceEntity>>;
  // Every child table read returns [] by default (a plain flat/non-legged service) — tests that
  // need children override mockTx.find's implementation per-call. Mirrors
  // typeorm-booking.repository.spec.ts's own manager.transaction/mockTx split.
  let mockTx: { find: jest.Mock; save: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    mockTx = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmServiceRepository,
        {
          provide: getRepositoryToken(ServiceEntity),
          useValue: {
            findOne: jest.fn(),
            exists: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            manager: {
              find: jest.fn().mockResolvedValue([]),
              transaction: jest
                .fn()
                .mockImplementation(async (cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx)),
            },
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

  it('existsById probes with a tenant-scoped exists() and never hydrates the aggregate', async () => {
    ormRepo.exists.mockResolvedValue(true);

    await expect(repo.existsById('svc-1', 'tenant-1')).resolves.toBe(true);

    expect(ormRepo.exists).toHaveBeenCalledWith({ where: { id: 'svc-1', tenantId: 'tenant-1' } });
    expect(ormRepo.findOne).not.toHaveBeenCalled();
    expect(ormRepo.manager.find).not.toHaveBeenCalled();
  });

  it('existsById is false when the row is missing or belongs to another tenant', async () => {
    ormRepo.exists.mockResolvedValue(false);

    await expect(repo.existsById('svc-1', 'tenant-other')).resolves.toBe(false);
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

  it('findByIdForUpdate throws when called outside an active transaction', async () => {
    await expect(repo.findByIdForUpdate('some-id', 'tenant-1')).rejects.toThrow(
      'findByIdForUpdate must be called inside an active transaction',
    );
  });

  it('findByIdForUpdate locks the row with pessimistic_write via the active EntityManager', async () => {
    const entity = new ServiceEntityBuilder().withTenantId('tenant-1').build();
    const mockManager = {
      findOne: jest.fn().mockResolvedValue(entity),
      find: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;

    const result = await runWithEntityManager(mockManager, () =>
      repo.findByIdForUpdate(entity.id, 'tenant-1'),
    );

    expect(result).toBeInstanceOf(Service);
    expect(mockManager.findOne).toHaveBeenCalledWith(ServiceEntity, {
      where: { id: entity.id, tenantId: 'tenant-1' },
      lock: { mode: 'pessimistic_write' },
    });
  });

  it('findByIdForUpdate returns null when not found', async () => {
    const mockManager = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
    } as unknown as EntityManager;

    const result = await runWithEntityManager(mockManager, () =>
      repo.findByIdForUpdate('unknown', 'tenant-1'),
    );

    expect(result).toBeNull();
  });

  it('lockBookingModels throws when called outside an active transaction', async () => {
    await expect(repo.lockBookingModels(['some-id'], 'tenant-1')).rejects.toThrow(
      'lockBookingModels must be called inside an active transaction',
    );
  });

  it('lockBookingModels returns an empty map without touching the manager when given no ids', async () => {
    const mockManager = { find: jest.fn() } as unknown as EntityManager;

    const result = await runWithEntityManager(mockManager, () =>
      repo.lockBookingModels([], 'tenant-1'),
    );

    expect(result).toEqual(new Map());
    expect(mockManager.find).not.toHaveBeenCalled();
  });

  it('lockBookingModels locks every row ordered by id, independent of the input array order', async () => {
    const mockManager = {
      find: jest.fn().mockResolvedValue([
        { id: 'svc-1', bookingModel: 'APPOINTMENT' },
        { id: 'svc-2', bookingModel: 'SESSION' },
      ]),
    } as unknown as EntityManager;

    const result = await runWithEntityManager(mockManager, () =>
      repo.lockBookingModels(['svc-2', 'svc-1'], 'tenant-1'),
    );

    expect(result).toEqual(
      new Map([
        ['svc-1', 'APPOINTMENT'],
        ['svc-2', 'SESSION'],
      ]),
    );
    expect(mockManager.find).toHaveBeenCalledWith(ServiceEntity, {
      where: { id: In(['svc-2', 'svc-1']), tenantId: 'tenant-1' },
      select: { id: true, bookingModel: true },
      order: { id: 'ASC' },
      lock: { mode: 'pessimistic_write' },
    });
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
    const service = Service.create({
      tenantId: 'tenant-1',
      name: 'Lavagem',
      price: Money.from(150, 'BRL'),
      durationMinutes: 60,
      loyaltyPointsValue: 10,
    });

    await repo.save(service);

    expect(mockTx.save).toHaveBeenCalledWith(
      ServiceEntity,
      expect.objectContaining({
        tenantId: 'tenant-1',
        name: 'Lavagem',
        priceAmount: '150.00',
        durationMinutes: 60,
        loyaltyPointsValue: 10,
        bookingModel: 'APPOINTMENT',
      }),
    );
  });

  it('save wholesale-replaces resourceRequirements: deletes existing rows, inserts current ones', async () => {
    // setResourceRequirements() (not the builder's raw field) so the save actually has children
    // to sync — Service.hasChildrenChanges is false for a plain reconstitute()'d fixture, mirroring
    // real production flows where an already-persisted service only re-syncs its child tables
    // after a setter that actually touches them is called (see typeorm-service.repository.ts).
    const service = new ServiceBuilder().withTenantId('tenant-1').build();
    service.setResourceRequirements(
      [ResourceRequirement.create({ type: ResourceType.STAFF, selectionMode: 'AUTO_ANY' })],
      new Map([[ResourceType.STAFF, new Set(['staff-1'])]]),
    );

    await repo.save(service);

    expect(mockTx.delete).toHaveBeenCalledWith(ServiceResourceRequirementEntity, {
      tenantId: 'tenant-1',
      serviceId: service.id,
    });
    expect(mockTx.save).toHaveBeenCalledWith(
      ServiceResourceRequirementEntity,
      expect.arrayContaining([expect.objectContaining({ resourceType: ResourceType.STAFF })]),
    );
  });

  it('findById hydrates resourceRequirements from the child table rows', async () => {
    const entity = new ServiceEntityBuilder().withTenantId('tenant-1').build();
    ormRepo.findOne.mockResolvedValue(entity);
    const requirementRow = new ServiceResourceRequirementEntityBuilder()
      .withId('req-1')
      .withTenantId('tenant-1')
      .withServiceId(entity.id)
      .withResourceType(ResourceType.STAFF)
      .withSelectionMode('AUTO_ANY')
      .withRequiredQuantity(1)
      .build();
    ormRepo.manager.find = jest
      .fn()
      .mockImplementation((EntityClass: unknown) =>
        EntityClass === ServiceResourceRequirementEntity
          ? Promise.resolve([requirementRow])
          : Promise.resolve([]),
      );

    const result = await repo.findById(entity.id, 'tenant-1');

    expect(result!.resourceRequirements).toHaveLength(1);
    expect(result!.resourceRequirements[0].type).toBe(ResourceType.STAFF);
  });

  it('price.format() returns pt-BR format after round-trip through entity mapper', async () => {
    const entity = new ServiceEntityBuilder().withPriceAmount('150.00').build();
    ormRepo.findOne.mockResolvedValue(entity);

    const result = await repo.findById(entity.id, entity.tenantId);

    expect(result!.price.format('pt-BR')).toBe('R$\u00A0150,00');
  });
});
