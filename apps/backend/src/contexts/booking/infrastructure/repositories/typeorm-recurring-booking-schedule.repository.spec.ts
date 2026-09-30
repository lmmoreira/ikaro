import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RecurringBookingScheduleEntityBuilder } from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';
import { TypeOrmRecurringBookingScheduleRepository } from './typeorm-recurring-booking-schedule.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000201';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000202';

describe('TypeOrmRecurringBookingScheduleRepository', () => {
  let repo: TypeOrmRecurringBookingScheduleRepository;
  let ormRepo: jest.Mocked<Repository<RecurringBookingScheduleEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmRecurringBookingScheduleRepository,
        {
          provide: getRepositoryToken(RecurringBookingScheduleEntity),
          useValue: { findAndCount: jest.fn() },
        },
        {
          provide: getRepositoryToken(RecurringBookingScheduleResourceAssignmentEntity),
          useValue: { find: jest.fn() },
        },
        { provide: OUTBOX_PUBLISHER, useValue: new InMemoryEventBus() },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmRecurringBookingScheduleRepository);
    ormRepo = moduleRef.get(getRepositoryToken(RecurringBookingScheduleEntity));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('findAllByTenantPaginated', () => {
    it('returns an empty page with total 0 when nothing matches', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await repo.findAllByTenantPaginated(TENANT_ID, { limit: 25, offset: 0 });

      expect(result).toEqual({ items: [], total: 0 });
    });

    it('maps the page to domain aggregates and returns the full total', async () => {
      ormRepo.findAndCount.mockResolvedValue([
        [
          new RecurringBookingScheduleEntityBuilder().withTenantId(TENANT_ID).build(),
          new RecurringBookingScheduleEntityBuilder().withTenantId(TENANT_ID).build(),
        ],
        5,
      ]);

      const result = await repo.findAllByTenantPaginated(TENANT_ID, { limit: 2, offset: 0 });

      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(2);
      expect(result.items.every((s) => s.tenantId === TENANT_ID)).toBe(true);
    });

    it('applies take, skip and a createdAt DESC, id DESC order with the id tie-breaker', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);

      await repo.findAllByTenantPaginated(TENANT_ID, { limit: 10, offset: 20 });

      expect(ormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
          order: { createdAt: 'DESC', id: 'DESC' },
        }),
      );
    });

    it('always scopes by tenantId and adds no other filter when none is given', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);

      await repo.findAllByTenantPaginated(TENANT_ID, { limit: 25, offset: 0 });

      expect(ormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: TENANT_ID } }),
      );
    });

    it('adds the customerId and status filters when set', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);

      await repo.findAllByTenantPaginated(TENANT_ID, {
        customerId: CUSTOMER_ID,
        status: 'PENDING_APPROVAL',
        limit: 25,
        offset: 0,
      });

      expect(ormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: TENANT_ID, customerId: CUSTOMER_ID, status: 'PENDING_APPROVAL' },
        }),
      );
    });
  });
});
