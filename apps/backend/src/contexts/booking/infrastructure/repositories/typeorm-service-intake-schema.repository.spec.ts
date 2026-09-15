import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  let mockTx: { update: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    mockTx = { update: jest.fn(), save: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmServiceIntakeSchemaRepository,
        {
          provide: getRepositoryToken(ServiceBookingIntakeSchemaEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            manager: {
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
      ormRepo.findOne.mockResolvedValue(null);
      expect(await repo.findActiveByServiceId(SERVICE_ID, TENANT)).toBeNull();
    });

    it('maps the active entity to the domain aggregate', async () => {
      ormRepo.findOne.mockResolvedValue(entity());
      const schema = await repo.findActiveByServiceId(SERVICE_ID, TENANT);
      expect(schema?.version).toBe(1);
      expect(schema?.serviceId).toBe(SERVICE_ID);
    });
  });

  describe('findAllByServiceId', () => {
    it('returns every version, oldest first', async () => {
      ormRepo.find.mockResolvedValue([
        entity({ version: 1, isActive: false }),
        entity({ version: 2 }),
      ]);
      const schemas = await repo.findAllByServiceId(SERVICE_ID, TENANT);
      expect(schemas.map((s) => s.version)).toEqual([1, 2]);
      expect(ormRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { version: 'ASC' } }),
      );
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
