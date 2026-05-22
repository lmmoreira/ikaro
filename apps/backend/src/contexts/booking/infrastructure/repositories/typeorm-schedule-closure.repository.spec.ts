import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduleClosureEntityBuilder } from '../../../../test/builders/booking/index';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { ClosureReason, ScheduleClosure } from '../../domain/schedule-closure.aggregate';
import { ScheduleClosureEntity } from '../entities/schedule-closure.entity';
import { TypeOrmScheduleClosureRepository } from './typeorm-schedule-closure.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';
const CLOSURE_ID = '00000000-0000-7000-8000-000000000003';

describe('TypeOrmScheduleClosureRepository', () => {
  let repo: TypeOrmScheduleClosureRepository;
  let ormRepo: jest.Mocked<Repository<ScheduleClosureEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmScheduleClosureRepository,
        {
          provide: getRepositoryToken(ScheduleClosureEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmScheduleClosureRepository);
    ormRepo = moduleRef.get(getRepositoryToken(ScheduleClosureEntity));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('findById', () => {
    it('returns null when entity not found', async () => {
      ormRepo.findOne.mockResolvedValue(null);
      const result = await repo.findById(CLOSURE_ID, TENANT_ID);
      expect(result).toBeNull();
    });

    it('maps full-day closure entity to domain aggregate', async () => {
      const entity = new ScheduleClosureEntityBuilder()
        .withId(CLOSURE_ID)
        .withTenantId(TENANT_ID)
        .withDate('2026-12-25')
        .withReason(ClosureReason.HOLIDAY)
        .withNotes('Christmas')
        .withCreatedBy(STAFF_ID)
        .build();
      ormRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findById(CLOSURE_ID, TENANT_ID);

      expect(result).toBeInstanceOf(ScheduleClosure);
      expect(result!.id).toBe(CLOSURE_ID);
      expect(result!.startTime).toBeNull();
      expect(result!.endTime).toBeNull();
      expect(result!.isFullDay()).toBe(true);
      expect(result!.tenantId).toBe(TENANT_ID);
    });

    it('maps partial closure entity with startTime and endTime', async () => {
      const entity = new ScheduleClosureEntityBuilder()
        .withId(CLOSURE_ID)
        .withTenantId(TENANT_ID)
        .withDate('2026-12-25')
        .withStartTime('10:00')
        .withEndTime('12:00')
        .build();
      ormRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findById(CLOSURE_ID, TENANT_ID);

      expect(result!.startTime).toBeInstanceOf(TimeOfDay);
      expect(result!.startTime!.value).toBe('10:00');
      expect(result!.endTime).toBeInstanceOf(TimeOfDay);
      expect(result!.endTime!.value).toBe('12:00');
      expect(result!.isFullDay()).toBe(false);
    });

    it('maps HH:MM:SS time (as returned by PostgreSQL) to HH:MM via TimeOfDay normalisation', async () => {
      const entity = new ScheduleClosureEntityBuilder()
        .withId(CLOSURE_ID)
        .withTenantId(TENANT_ID)
        .withDate('2026-12-25')
        .withStartTime('10:00:00')
        .withEndTime('12:00:00')
        .build();
      ormRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findById(CLOSURE_ID, TENANT_ID);

      expect(result!.startTime!.value).toBe('10:00');
      expect(result!.endTime!.value).toBe('12:00');
    });
  });

  describe('findByTenantAndDate', () => {
    it('returns empty array when no closures on date', async () => {
      ormRepo.find.mockResolvedValue([]);
      const result = await repo.findByTenantAndDate(TENANT_ID, '2026-12-25');
      expect(result).toHaveLength(0);
    });

    it('returns multiple closures for same date', async () => {
      const entities = [
        new ScheduleClosureEntityBuilder().withId('id-1').withDate('2026-12-25').build(),
        new ScheduleClosureEntityBuilder()
          .withId('id-2')
          .withDate('2026-12-25')
          .withStartTime('14:00')
          .withEndTime('16:00')
          .build(),
      ];
      ormRepo.find.mockResolvedValue(entities);

      const result = await repo.findByTenantAndDate(TENANT_ID, '2026-12-25');

      expect(result).toHaveLength(2);
      expect(result.every((c) => c instanceof ScheduleClosure)).toBe(true);
    });
  });

  describe('findByTenantAndDateRange', () => {
    it('returns closures sorted by date and startTime', async () => {
      const entities = [
        new ScheduleClosureEntityBuilder().withId('id-1').withDate('2026-12-25').build(),
        new ScheduleClosureEntityBuilder().withId('id-2').withDate('2026-12-26').build(),
      ];
      ormRepo.find.mockResolvedValue(entities);

      const result = await repo.findByTenantAndDateRange(TENANT_ID, '2026-12-01', '2026-12-31');

      expect(result).toHaveLength(2);
      expect(ormRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { date: 'ASC', startTime: 'ASC' } }),
      );
    });
  });

  describe('save', () => {
    it('maps full-day closure to entity with null times', async () => {
      ormRepo.save.mockResolvedValue(new ScheduleClosureEntityBuilder().build());
      const closure = ScheduleClosure.reconstitute({
        id: CLOSURE_ID,
        tenantId: TENANT_ID,
        date: '2026-12-25',
        startTime: null,
        endTime: null,
        reason: ClosureReason.HOLIDAY,
        notes: null,
        createdBy: STAFF_ID,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      await repo.save(closure);

      expect(ormRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ startTime: null, endTime: null }),
      );
    });

    it('maps partial closure to entity with time string values', async () => {
      ormRepo.save.mockResolvedValue(new ScheduleClosureEntityBuilder().build());
      const closure = ScheduleClosure.reconstitute({
        id: CLOSURE_ID,
        tenantId: TENANT_ID,
        date: '2026-12-25',
        startTime: TimeOfDay.create('10:00'),
        endTime: TimeOfDay.create('12:00'),
        reason: ClosureReason.MAINTENANCE,
        notes: null,
        createdBy: STAFF_ID,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      await repo.save(closure);

      expect(ormRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ startTime: '10:00', endTime: '12:00' }),
      );
    });
  });

  describe('delete', () => {
    it('calls repo.delete with id and tenantId', async () => {
      ormRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await repo.delete(CLOSURE_ID, TENANT_ID);

      expect(ormRepo.delete).toHaveBeenCalledWith({ id: CLOSURE_ID, tenantId: TENANT_ID });
    });
  });
});
