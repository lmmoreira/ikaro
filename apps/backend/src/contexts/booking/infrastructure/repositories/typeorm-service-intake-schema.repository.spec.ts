import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { runWithEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ServiceBookingIntakeSchemaEntityBuilder } from '../../../../test/builders/booking/index';
import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';
import { ServiceBookingIntakeSchemaEntity } from '../entities/service-booking-intake-schema.entity';
import { TypeOrmServiceIntakeSchemaRepository } from './typeorm-service-intake-schema.repository';

const TENANT = 'tenant-abc';
const SERVICE_ID = 'service-1';

function entity(overrides: { version?: number; isActive?: boolean } = {}) {
  return new ServiceBookingIntakeSchemaEntityBuilder()
    .withId('schema-1')
    .withTenantId(TENANT)
    .withServiceId(SERVICE_ID)
    .withVersion(overrides.version ?? 1)
    .withIsActive(overrides.isActive ?? true)
    .build();
}

describe('TypeOrmServiceIntakeSchemaRepository', () => {
  let repo: TypeOrmServiceIntakeSchemaRepository;
  let ormRepo: jest.Mocked<Repository<ServiceBookingIntakeSchemaEntity>>;
  let mockTx: { update: jest.Mock; save: jest.Mock; findOne: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    mockTx = {
      update: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmServiceIntakeSchemaRepository,
        {
          provide: getRepositoryToken(ServiceBookingIntakeSchemaEntity),
          useValue: {
            manager: {
              findOne: jest.fn(),
              find: jest.fn(),
              transaction: jest
                .fn()
                .mockImplementation(async (cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx)),
            },
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmServiceIntakeSchemaRepository);
    ormRepo = moduleRef.get(getRepositoryToken(ServiceBookingIntakeSchemaEntity));
  });

  describe('findActiveByServiceId', () => {
    it('returns null when no active version exists', async () => {
      (ormRepo.manager.findOne as jest.Mock).mockResolvedValue(null);
      expect(await repo.findActiveByServiceId(SERVICE_ID, TENANT)).toBeNull();
    });

    it('maps the active entity to the domain aggregate', async () => {
      (ormRepo.manager.findOne as jest.Mock).mockResolvedValue(entity());
      const schema = await repo.findActiveByServiceId(SERVICE_ID, TENANT);
      expect(schema?.version).toBe(1);
      expect(schema?.serviceId).toBe(SERVICE_ID);
    });

    it('reads through the active transaction manager, not the repo-level one, when inside a transaction', async () => {
      const txManager = {
        findOne: jest.fn().mockResolvedValue(entity({ version: 3 })),
      } as unknown as EntityManager;

      const schema = await runWithEntityManager(txManager, () =>
        repo.findActiveByServiceId(SERVICE_ID, TENANT),
      );

      expect(schema?.version).toBe(3);
      expect(txManager.findOne).toHaveBeenCalledWith(
        ServiceBookingIntakeSchemaEntity,
        expect.objectContaining({
          where: { serviceId: SERVICE_ID, tenantId: TENANT, isActive: true },
        }),
      );
      expect(ormRepo.manager.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findAllByServiceId', () => {
    it('returns every version, oldest first', async () => {
      (ormRepo.manager.find as jest.Mock).mockResolvedValue([
        entity({ version: 1, isActive: false }),
        entity({ version: 2 }),
      ]);
      const schemas = await repo.findAllByServiceId(SERVICE_ID, TENANT);
      expect(schemas.map((s) => s.version)).toEqual([1, 2]);
      expect(ormRepo.manager.find).toHaveBeenCalledWith(
        ServiceBookingIntakeSchemaEntity,
        expect.objectContaining({ order: { version: 'ASC' } }),
      );
    });
  });

  describe('findLatestByServiceId', () => {
    it('reads only the requested number of newest versions, newest first, scoped to the tenant', async () => {
      (ormRepo.manager.find as jest.Mock).mockResolvedValue([
        entity({ version: 3 }),
        entity({ version: 2, isActive: false }),
      ]);

      const schemas = await repo.findLatestByServiceId(SERVICE_ID, TENANT, 2);

      expect(schemas.map((s) => s.version)).toEqual([3, 2]);
      expect(ormRepo.manager.find).toHaveBeenCalledWith(ServiceBookingIntakeSchemaEntity, {
        where: { serviceId: SERVICE_ID, tenantId: TENANT },
        order: { version: 'DESC' },
        take: 2,
      });
    });
  });

  describe('publish', () => {
    it('deactivates the current active version and inserts the new one in one transaction', async () => {
      const schema = ServiceBookingIntakeSchema.publish({
        tenantId: TENANT,
        serviceId: SERVICE_ID,
        previousVersion: 1,
        questions: [],
        consentText: 'Texto',
        requiresNamedAttendees: false,
        participantCountRequired: false,
      });

      await repo.publish(schema);

      expect(mockTx.update).toHaveBeenCalledWith(
        ServiceBookingIntakeSchemaEntity,
        { tenantId: TENANT, serviceId: SERVICE_ID, isActive: true },
        { isActive: false },
      );
      expect(mockTx.save).toHaveBeenCalledWith(
        ServiceBookingIntakeSchemaEntity,
        expect.objectContaining({ version: 2, id: schema.id }),
      );
    });
  });
});
