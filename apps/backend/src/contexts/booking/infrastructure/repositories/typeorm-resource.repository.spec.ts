import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { ResourceEntityBuilder } from '../../../../test/builders/booking/index';
import { Resource } from '../../domain/resource.aggregate';
import { ResourceStaffAlreadyWrappedError } from '../../domain/errors/resource.error';
import { ResourceType } from '../../domain/resource.types';
import { ResourceEntity } from '../entities/resource.entity';
import { TypeOrmResourceRepository } from './typeorm-resource.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';
const RESOURCE_ID = '00000000-0000-7000-8000-000000000003';

describe('TypeOrmResourceRepository', () => {
  let repo: TypeOrmResourceRepository;
  let ormRepo: jest.Mocked<Repository<ResourceEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmResourceRepository,
        {
          provide: getRepositoryToken(ResourceEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmResourceRepository);
    ormRepo = moduleRef.get(getRepositoryToken(ResourceEntity));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('findById', () => {
    it('returns null when entity not found', async () => {
      ormRepo.findOne.mockResolvedValue(null);
      const result = await repo.findById(RESOURCE_ID, TENANT_ID);
      expect(result).toBeNull();
    });

    it('maps entity to domain aggregate', async () => {
      const entity = new ResourceEntityBuilder()
        .withId(RESOURCE_ID)
        .withTenantId(TENANT_ID)
        .withType(ResourceType.ROOM)
        .withName('Estúdio 1')
        .withMaxCapacity(12)
        .build();
      ormRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findById(RESOURCE_ID, TENANT_ID);

      expect(result).toBeInstanceOf(Resource);
      expect(result!.id).toBe(RESOURCE_ID);
      expect(result!.type).toBe(ResourceType.ROOM);
      expect(result!.maxCapacity).toBe(12);
    });
  });

  describe('findByRefId', () => {
    it('returns the wrapping resource for a staff member', async () => {
      const entity = new ResourceEntityBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.STAFF)
        .withRefId(STAFF_ID)
        .build();
      ormRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findByRefId(STAFF_ID, TENANT_ID);

      expect(result!.refId).toBe(STAFF_ID);
      expect(ormRepo.findOne).toHaveBeenCalledWith({
        where: { refId: STAFF_ID, tenantId: TENANT_ID, type: ResourceType.STAFF },
      });
    });
  });

  describe('findByTenant', () => {
    it('applies type and isActive filters', async () => {
      ormRepo.find.mockResolvedValue([]);

      await repo.findByTenant(TENANT_ID, { type: ResourceType.ROOM, isActive: true });

      expect(ormRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, type: ResourceType.ROOM, isActive: true },
        }),
      );
    });

    it('omits filters when not provided', async () => {
      ormRepo.find.mockResolvedValue([]);

      await repo.findByTenant(TENANT_ID, {});

      expect(ormRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_ID } }),
      );
    });
  });

  describe('save', () => {
    it('maps aggregate to entity and persists it', async () => {
      ormRepo.save.mockResolvedValue(new ResourceEntityBuilder().build());
      const resource = Resource.reconstitute({
        id: RESOURCE_ID,
        tenantId: TENANT_ID,
        type: ResourceType.EQUIPMENT,
        refId: null,
        name: 'Máquina 1',
        workingHours: null,
        turnoverMinutes: 5,
        maxCapacity: null,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });

      await repo.save(resource);

      expect(ormRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: RESOURCE_ID, name: 'Máquina 1', turnoverMinutes: 5 }),
      );
    });

    it('translates a concurrent duplicate STAFF-wrap unique-index violation to ResourceStaffAlreadyWrappedError', async () => {
      // App-level pre-check (CreateResourceUseCase) closes the common case; this proves the DB
      // partial-unique-index is still the authoritative backstop for the rare concurrent race
      // (mirrors typeorm-booking.repository.spec.ts's exclusion-violation mapping test).
      ormRepo.save.mockRejectedValue(
        new QueryFailedError(
          'INSERT INTO booking.resources ...',
          [],
          Object.assign(new Error(), {
            code: '23505',
            constraint: 'UQ_booking_resources_tenant_ref_id',
          }),
        ),
      );
      const resource = Resource.reconstitute({
        id: RESOURCE_ID,
        tenantId: TENANT_ID,
        type: ResourceType.STAFF,
        refId: STAFF_ID,
        name: 'Camila Duarte',
        workingHours: null,
        turnoverMinutes: 0,
        maxCapacity: null,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });

      await expect(repo.save(resource)).rejects.toBeInstanceOf(ResourceStaffAlreadyWrappedError);
    });

    it('rethrows an unrelated QueryFailedError unchanged', async () => {
      const unrelatedError = new QueryFailedError(
        'INSERT INTO booking.resources ...',
        [],
        Object.assign(new Error(), { code: '23505', constraint: 'some_other_constraint' }),
      );
      ormRepo.save.mockRejectedValue(unrelatedError);
      const resource = Resource.reconstitute({
        id: RESOURCE_ID,
        tenantId: TENANT_ID,
        type: ResourceType.ROOM,
        refId: null,
        name: 'Estúdio 1',
        workingHours: null,
        turnoverMinutes: 0,
        maxCapacity: null,
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      });

      await expect(repo.save(resource)).rejects.toBe(unrelatedError);
    });
  });
});
