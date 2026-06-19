import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Between, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryTenantLocalizationPort } from '../../../../test/infrastructure/in-memory-tenant-localization.port';
import { Money } from '../../../../shared/value-objects/money';
import { TENANT_LOCALIZATION_PORT } from '../../application/ports/tenant-localization.port';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { TypeOrmBookingRepository } from './typeorm-booking.repository';

describe('TypeOrmBookingRepository', () => {
  let repo: TypeOrmBookingRepository;
  let ormRepo: jest.Mocked<Repository<BookingEntity>>;
  let ormLineRepo: jest.Mocked<Repository<BookingLineEntity>>;
  let mockTx: { save: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    mockTx = {
      save: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({ affected: 1, raw: [] }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmBookingRepository,
        {
          provide: getRepositoryToken(BookingEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
            manager: {
              transaction: jest
                .fn()
                .mockImplementation(async (cb: (tx: typeof mockTx) => Promise<void>) => cb(mockTx)),
            },
          },
        },
        {
          provide: getRepositoryToken(BookingLineEntity),
          useValue: { find: jest.fn(), save: jest.fn(), delete: jest.fn() },
        },
        { provide: TENANT_LOCALIZATION_PORT, useClass: InMemoryTenantLocalizationPort },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmBookingRepository);
    ormRepo = moduleRef.get(getRepositoryToken(BookingEntity));
    ormLineRepo = moduleRef.get(getRepositoryToken(BookingLineEntity));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('findById', () => {
    it('returns null when booking not found', async () => {
      ormRepo.findOne.mockResolvedValue(null);

      const result = await repo.findById('some-id', 'tenant-1');

      expect(result).toBeNull();
      expect(ormLineRepo.find).not.toHaveBeenCalled();
    });

    it('returns domain aggregate with lines when found', async () => {
      const bookingId = '00000000-0000-7000-8000-000000000010';
      const tenantId = '00000000-0000-7000-8000-000000000001';

      const bookingEntity = new BookingEntityBuilder()
        .withId(bookingId)
        .withTenantId(tenantId)
        .withContactEmail('joao@example.com')
        .withContactPhone('31999999999')
        .withTotalPriceAmount('150.00')
        .build();

      const lineEntity = new BookingLineEntityBuilder()
        .withBookingId(bookingId)
        .withTenantId(tenantId)
        .withServiceNameAtBooking('Lavagem Completa')
        .withPriceAtBookingAmount('150.00')
        .withDurationMinsAtBooking(60)
        .build();

      ormRepo.findOne.mockResolvedValue(bookingEntity);
      ormLineRepo.find.mockResolvedValue([lineEntity]);

      const result = await repo.findById(bookingId, tenantId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(bookingId);
      expect(result!.tenantId).toBe(tenantId);
      expect(result!.contactEmail.address).toBe('joao@example.com');
      expect(result!.totalPrice.amount.toNumber()).toBe(150);
      expect(result!.lines).toHaveLength(1);
      expect(result!.lines[0].serviceNameAtBooking).toBe('Lavagem Completa');
    });

    it('returns null for wrong tenant (isolation)', async () => {
      ormRepo.findOne.mockResolvedValue(null);

      const result = await repo.findById('some-id', 'wrong-tenant');

      expect(result).toBeNull();
      expect(ormRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'some-id', tenantId: 'wrong-tenant' },
      });
    });
  });

  describe('findAllByTenant', () => {
    it('returns empty array when no bookings found', async () => {
      ormRepo.find.mockResolvedValue([]);

      const result = await repo.findAllByTenant('tenant-1');

      expect(result).toEqual([]);
      expect(ormLineRepo.find).not.toHaveBeenCalled();
    });

    it('fetches lines for all returned bookings in a single query', async () => {
      const tenantId = '00000000-0000-7000-8000-000000000001';
      const bookingId1 = '00000000-0000-7000-8000-000000000011';
      const bookingId2 = '00000000-0000-7000-8000-000000000012';

      ormRepo.find.mockResolvedValue([
        new BookingEntityBuilder().withId(bookingId1).withTenantId(tenantId).build(),
        new BookingEntityBuilder().withId(bookingId2).withTenantId(tenantId).build(),
      ]);
      ormLineRepo.find.mockResolvedValue([
        new BookingLineEntityBuilder().withBookingId(bookingId1).withTenantId(tenantId).build(),
        new BookingLineEntityBuilder().withBookingId(bookingId2).withTenantId(tenantId).build(),
      ]);

      const result = await repo.findAllByTenant(tenantId);

      expect(result).toHaveLength(2);
      expect(result[0].lines).toHaveLength(1);
      expect(result[1].lines).toHaveLength(1);
      expect(ormLineRepo.find).toHaveBeenCalledTimes(1);
    });

    it('applies status filter to the where clause', async () => {
      ormRepo.find.mockResolvedValue([]);

      await repo.findAllByTenant('tenant-1', { status: BookingStatus.APPROVED });

      expect(ormRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 'tenant-1', status: BookingStatus.APPROVED },
        }),
      );
    });
  });

  describe('findAllByTenantPaginated', () => {
    const tenantId = '00000000-0000-7000-8000-000000000001';

    it('returns empty result without loading lines when no bookings found', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await repo.findAllByTenantPaginated(tenantId, { limit: 25, offset: 0 });

      expect(result).toEqual({ items: [], total: 0 });
      expect(ormLineRepo.find).not.toHaveBeenCalled();
    });

    it('returns paginated items with total and loads lines in one query', async () => {
      const bookingId1 = '00000000-0000-7000-8000-000000000031';
      const bookingId2 = '00000000-0000-7000-8000-000000000032';

      ormRepo.findAndCount.mockResolvedValue([
        [
          new BookingEntityBuilder().withId(bookingId1).withTenantId(tenantId).build(),
          new BookingEntityBuilder().withId(bookingId2).withTenantId(tenantId).build(),
        ],
        5,
      ]);
      ormLineRepo.find.mockResolvedValue([
        new BookingLineEntityBuilder().withBookingId(bookingId1).withTenantId(tenantId).build(),
        new BookingLineEntityBuilder().withBookingId(bookingId2).withTenantId(tenantId).build(),
      ]);

      const result = await repo.findAllByTenantPaginated(tenantId, { limit: 2, offset: 0 });

      expect(result.total).toBe(5);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].lines).toHaveLength(1);
      expect(ormLineRepo.find).toHaveBeenCalledTimes(1);
    });

    it('applies take, skip, and order to findAndCount', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);

      await repo.findAllByTenantPaginated(tenantId, { limit: 10, offset: 20 });

      expect(ormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 10, skip: 20, order: { scheduledAt: 'DESC' } }),
      );
    });

    it('applies status filter', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);

      await repo.findAllByTenantPaginated(tenantId, {
        limit: 25,
        offset: 0,
        status: BookingStatus.APPROVED,
      });

      expect(ormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: BookingStatus.APPROVED }),
        }),
      );
    });

    it('applies customerId filter', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);

      await repo.findAllByTenantPaginated(tenantId, {
        limit: 25,
        offset: 0,
        customerId: 'cust-123',
      });

      expect(ormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ customerId: 'cust-123' }) }),
      );
    });

    it('uses Between when both scheduledAfter and scheduledBefore provided', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);
      const after = new Date('2026-06-01T00:00:00Z');
      const before = new Date('2026-06-30T23:59:59Z');

      await repo.findAllByTenantPaginated(tenantId, {
        limit: 25,
        offset: 0,
        scheduledAfter: after,
        scheduledBefore: before,
      });

      expect(ormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scheduledAt: Between(after, before) }),
        }),
      );
    });

    it('uses MoreThanOrEqual when only scheduledAfter provided', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);
      const after = new Date('2026-06-01T00:00:00Z');

      await repo.findAllByTenantPaginated(tenantId, {
        limit: 25,
        offset: 0,
        scheduledAfter: after,
      });

      expect(ormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scheduledAt: MoreThanOrEqual(after) }),
        }),
      );
    });

    it('uses LessThanOrEqual when only scheduledBefore provided', async () => {
      ormRepo.findAndCount.mockResolvedValue([[], 0]);
      const before = new Date('2026-06-30T23:59:59Z');

      await repo.findAllByTenantPaginated(tenantId, {
        limit: 25,
        offset: 0,
        scheduledBefore: before,
      });

      expect(ormRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ scheduledAt: LessThanOrEqual(before) }),
        }),
      );
    });
  });

  describe('save', () => {
    it('saves booking header without touching lines when linesModified is false', async () => {
      const bookingEntity = new BookingEntityBuilder()
        .withId('00000000-0000-7000-8000-000000000020')
        .withTenantId('tenant-1')
        .build();
      const lineEntity = new BookingLineEntityBuilder()
        .withBookingId('00000000-0000-7000-8000-000000000020')
        .withTenantId('tenant-1')
        .build();

      ormRepo.findOne.mockResolvedValue(bookingEntity);
      ormLineRepo.find.mockResolvedValue([lineEntity]);

      const aggregate = await repo.findById('00000000-0000-7000-8000-000000000020', 'tenant-1');
      await repo.save(aggregate!);

      expect(mockTx.save).toHaveBeenCalledWith(
        BookingEntity,
        expect.objectContaining({ id: '00000000-0000-7000-8000-000000000020' }),
      );
      expect(mockTx.save).toHaveBeenCalledTimes(1);
      expect(mockTx.delete).not.toHaveBeenCalled();
    });

    it('deletes and re-inserts lines when linesModified is true', async () => {
      const LINE_ID = '00000000-0000-7000-8000-000000000023';
      const bookingEntity = new BookingEntityBuilder()
        .withId('00000000-0000-7000-8000-000000000022')
        .withTenantId('tenant-1')
        .withStatus('APPROVED')
        .build();
      const lineEntity = new BookingLineEntityBuilder()
        .withLineId(LINE_ID)
        .withBookingId('00000000-0000-7000-8000-000000000022')
        .withTenantId('tenant-1')
        .build();

      ormRepo.findOne.mockResolvedValue(bookingEntity);
      ormLineRepo.find.mockResolvedValue([lineEntity]);

      const aggregate = await repo.findById('00000000-0000-7000-8000-000000000022', 'tenant-1');
      aggregate!.complete('staff-id', new Map([[LINE_ID, Money.from(100, 'BRL')]]), [], 'corr-1');
      aggregate!.clearDomainEvents();
      await repo.save(aggregate!);

      expect(mockTx.save).toHaveBeenCalledWith(
        BookingEntity,
        expect.objectContaining({ id: '00000000-0000-7000-8000-000000000022' }),
      );
      expect(mockTx.delete).toHaveBeenCalledWith(BookingLineEntity, {
        bookingId: '00000000-0000-7000-8000-000000000022',
        tenantId: 'tenant-1',
      });
      expect(mockTx.save).toHaveBeenCalledWith(BookingLineEntity, expect.any(Array));
    });

    it('maps totalPriceAmount as fixed-point string', async () => {
      const bookingEntity = new BookingEntityBuilder()
        .withId('00000000-0000-7000-8000-000000000021')
        .withTenantId('tenant-2')
        .withTotalPriceAmount('250.50')
        .build();
      const lineEntity = new BookingLineEntityBuilder()
        .withBookingId('00000000-0000-7000-8000-000000000021')
        .withTenantId('tenant-2')
        .build();

      ormRepo.findOne.mockResolvedValue(bookingEntity);
      ormLineRepo.find.mockResolvedValue([lineEntity]);

      const aggregate = await repo.findById('00000000-0000-7000-8000-000000000021', 'tenant-2');
      await repo.save(aggregate!);

      expect(mockTx.save).toHaveBeenCalledWith(
        BookingEntity,
        expect.objectContaining({ totalPriceAmount: '250.50' }),
      );
    });
  });
});
