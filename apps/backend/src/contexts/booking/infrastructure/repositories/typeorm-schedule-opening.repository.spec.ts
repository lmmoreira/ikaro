import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScheduleOpeningEntityBuilder } from '../../../../test/builders/booking/index';
import { TimeOfDay } from '../../../../shared/value-objects/time-of-day.vo';
import { ScheduleOpening } from '../../domain/schedule-opening.aggregate';
import { ScheduleOpeningEntity } from '../entities/schedule-opening.entity';
import { TypeOrmScheduleOpeningRepository } from './typeorm-schedule-opening.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';
const OPENING_ID = '00000000-0000-7000-8000-000000000003';

describe('TypeOrmScheduleOpeningRepository', () => {
  let repo: TypeOrmScheduleOpeningRepository;
  let ormRepo: jest.Mocked<Repository<ScheduleOpeningEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmScheduleOpeningRepository,
        {
          provide: getRepositoryToken(ScheduleOpeningEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmScheduleOpeningRepository);
    ormRepo = moduleRef.get(getRepositoryToken(ScheduleOpeningEntity));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('findById', () => {
    it('returns null when entity not found', async () => {
      ormRepo.findOne.mockResolvedValue(null);
      const result = await repo.findById(OPENING_ID, TENANT_ID);
      expect(result).toBeNull();
    });

    it('maps entity to domain aggregate with correct VO fields', async () => {
      const entity = new ScheduleOpeningEntityBuilder()
        .withId(OPENING_ID)
        .withTenantId(TENANT_ID)
        .withDate('2026-12-28')
        .withStartTime('09:00')
        .withEndTime('14:00')
        .withNotes('Special Sunday opening')
        .withCreatedBy(STAFF_ID)
        .build();
      ormRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findById(OPENING_ID, TENANT_ID);

      expect(result).toBeInstanceOf(ScheduleOpening);
      expect(result!.id).toBe(OPENING_ID);
      expect(result!.tenantId).toBe(TENANT_ID);
      expect(result!.date).toBe('2026-12-28');
      expect(result!.startTime).toBeInstanceOf(TimeOfDay);
      expect(result!.startTime.value).toBe('09:00');
      expect(result!.endTime).toBeInstanceOf(TimeOfDay);
      expect(result!.endTime.value).toBe('14:00');
      expect(result!.notes).toBe('Special Sunday opening');
    });

    it('maps HH:MM:SS time (as returned by PostgreSQL) to HH:MM via TimeOfDay normalisation', async () => {
      const entity = new ScheduleOpeningEntityBuilder()
        .withId(OPENING_ID)
        .withTenantId(TENANT_ID)
        .withDate('2026-12-28')
        .withStartTime('09:00:00')
        .withEndTime('14:00:00')
        .build();
      ormRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findById(OPENING_ID, TENANT_ID);

      expect(result!.startTime.value).toBe('09:00');
      expect(result!.endTime.value).toBe('14:00');
    });
  });

  describe('findByTenantAndDate', () => {
    it('returns null when no opening exists for date', async () => {
      ormRepo.findOne.mockResolvedValue(null);
      const result = await repo.findByTenantAndDate(TENANT_ID, '2026-12-28');
      expect(result).toBeNull();
    });

    it('returns the opening when one exists for the date', async () => {
      const entity = new ScheduleOpeningEntityBuilder()
        .withTenantId(TENANT_ID)
        .withDate('2026-12-28')
        .build();
      ormRepo.findOne.mockResolvedValue(entity);

      const result = await repo.findByTenantAndDate(TENANT_ID, '2026-12-28');

      expect(result).toBeInstanceOf(ScheduleOpening);
      expect(result!.date).toBe('2026-12-28');
    });
  });

  describe('findByTenantAndDateRange', () => {
    it('returns openings sorted by date', async () => {
      const entities = [
        new ScheduleOpeningEntityBuilder().withId('id-1').withDate('2026-12-21').build(),
        new ScheduleOpeningEntityBuilder().withId('id-2').withDate('2026-12-28').build(),
      ];
      ormRepo.find.mockResolvedValue(entities);

      const result = await repo.findByTenantAndDateRange(TENANT_ID, '2026-12-01', '2026-12-31');

      expect(result).toHaveLength(2);
      expect(result.every((o) => o instanceof ScheduleOpening)).toBe(true);
      expect(ormRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { date: 'ASC' } }),
      );
    });

    it('returns empty array when no openings in range', async () => {
      ormRepo.find.mockResolvedValue([]);
      const result = await repo.findByTenantAndDateRange(TENANT_ID, '2026-11-01', '2026-11-30');
      expect(result).toHaveLength(0);
    });
  });

  describe('save', () => {
    it('maps domain aggregate to entity with correct time string values', async () => {
      ormRepo.save.mockResolvedValue(new ScheduleOpeningEntityBuilder().build());
      const opening = ScheduleOpening.reconstitute({
        id: OPENING_ID,
        tenantId: TENANT_ID,
        date: '2026-12-28',
        startTime: TimeOfDay.create('09:00'),
        endTime: TimeOfDay.create('14:00'),
        notes: 'Special event',
        createdBy: STAFF_ID,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      await repo.save(opening);

      expect(ormRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: OPENING_ID,
          tenantId: TENANT_ID,
          date: '2026-12-28',
          startTime: '09:00',
          endTime: '14:00',
          notes: 'Special event',
        }),
      );
    });

    it('maps null notes correctly', async () => {
      ormRepo.save.mockResolvedValue(new ScheduleOpeningEntityBuilder().build());
      const opening = ScheduleOpening.reconstitute({
        id: OPENING_ID,
        tenantId: TENANT_ID,
        date: '2026-12-28',
        startTime: TimeOfDay.create('09:00'),
        endTime: TimeOfDay.create('14:00'),
        notes: null,
        createdBy: STAFF_ID,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });

      await repo.save(opening);

      expect(ormRepo.save).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
    });
  });

  describe('delete', () => {
    it('calls repo.delete with id and tenantId', async () => {
      ormRepo.delete.mockResolvedValue({ affected: 1, raw: [] });

      await repo.delete(OPENING_ID, TENANT_ID);

      expect(ormRepo.delete).toHaveBeenCalledWith({ id: OPENING_ID, tenantId: TENANT_ID });
    });
  });
});
