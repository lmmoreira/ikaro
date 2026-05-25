import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingEntityBuilder } from '../../../../test/builders/booking/index';
import { BookingStatus } from '../../domain/booking.aggregate';
import { BookingEntity } from '../entities/booking.entity';
import { TypeOrmBookingAvailabilityAdapter } from './typeorm-booking-availability.adapter';

describe('TypeOrmBookingAvailabilityAdapter', () => {
  let adapter: TypeOrmBookingAvailabilityAdapter;
  let ormRepo: jest.Mocked<Repository<BookingEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmBookingAvailabilityAdapter,
        {
          provide: getRepositoryToken(BookingEntity),
          useValue: { find: jest.fn() },
        },
      ],
    }).compile();

    adapter = moduleRef.get(TypeOrmBookingAvailabilityAdapter);
    ormRepo = moduleRef.get(getRepositoryToken(BookingEntity));
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('findApprovedByTenantAndDate', () => {
    it('returns empty array when no approved bookings on that date', async () => {
      ormRepo.find.mockResolvedValue([]);

      const result = await adapter.findApprovedByTenantAndDate('tenant-1', '2026-06-01');

      expect(result).toEqual([]);
    });

    it('returns BookedSlots for approved bookings on the date', async () => {
      const scheduledAt = new Date('2026-06-01T10:00:00.000Z');
      const entity = new BookingEntityBuilder()
        .withStatus(BookingStatus.APPROVED)
        .withScheduledAt(scheduledAt)
        .withTotalDurationMins(60)
        .build();
      ormRepo.find.mockResolvedValue([entity]);

      const result = await adapter.findApprovedByTenantAndDate('tenant-1', '2026-06-01');

      expect(result).toHaveLength(1);
      expect(result[0].scheduledAt).toEqual(scheduledAt);
      expect(result[0].totalDurationMins).toBe(60);
    });

    it('queries with Between boundaries for the full UTC day', async () => {
      ormRepo.find.mockResolvedValue([]);

      await adapter.findApprovedByTenantAndDate('tenant-1', '2026-06-01');

      expect(ormRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 'tenant-1',
            status: BookingStatus.APPROVED,
          }),
        }),
      );
    });
  });

  describe('findApprovedByTenantAndDateRange', () => {
    it('returns empty array when no approved bookings in range', async () => {
      ormRepo.find.mockResolvedValue([]);

      const result = await adapter.findApprovedByTenantAndDateRange(
        'tenant-1',
        '2026-06-01',
        '2026-06-07',
      );

      expect(result).toEqual([]);
    });

    it('returns multiple BookedSlots across multiple days', async () => {
      const entities = [
        new BookingEntityBuilder()
          .withStatus(BookingStatus.APPROVED)
          .withScheduledAt(new Date('2026-06-02T09:00:00.000Z'))
          .withTotalDurationMins(30)
          .build(),
        new BookingEntityBuilder()
          .withStatus(BookingStatus.APPROVED)
          .withScheduledAt(new Date('2026-06-05T14:00:00.000Z'))
          .withTotalDurationMins(45)
          .build(),
      ];
      ormRepo.find.mockResolvedValue(entities);

      const result = await adapter.findApprovedByTenantAndDateRange(
        'tenant-1',
        '2026-06-01',
        '2026-06-07',
      );

      expect(result).toHaveLength(2);
      expect(result[0].totalDurationMins).toBe(30);
      expect(result[1].totalDurationMins).toBe(45);
      expect(ormRepo.find).toHaveBeenCalledTimes(1);
    });
  });
});
