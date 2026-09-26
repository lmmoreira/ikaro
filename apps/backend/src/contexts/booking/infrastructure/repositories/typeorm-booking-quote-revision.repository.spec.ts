import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BookingQuoteRevisionEntityBuilder } from '../../../../test/builders/booking/index';
import { Money } from '../../../../shared/value-objects/money';
import { BookingQuoteRevision } from '../../domain/booking-quote-revision';
import { BookingQuoteRevisionEntity } from '../entities/booking-quote-revision.entity';
import { TypeOrmBookingQuoteRevisionRepository } from './typeorm-booking-quote-revision.repository';

const TENANT = 'tenant-abc';
const BOOKING_ID = 'booking-1';

describe('TypeOrmBookingQuoteRevisionRepository', () => {
  let repo: TypeOrmBookingQuoteRevisionRepository;
  let ormRepo: jest.Mocked<Repository<BookingQuoteRevisionEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmBookingQuoteRevisionRepository,
        {
          provide: getRepositoryToken(BookingQuoteRevisionEntity),
          useValue: {
            manager: {
              findOne: jest.fn(),
              insert: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmBookingQuoteRevisionRepository);
    ormRepo = moduleRef.get(getRepositoryToken(BookingQuoteRevisionEntity));
  });

  describe('findLatestRevisionNo', () => {
    it('returns 0 when the booking has no prior revision', async () => {
      (ormRepo.manager.findOne as jest.Mock).mockResolvedValue(null);

      const result = await repo.findLatestRevisionNo(TENANT, BOOKING_ID);

      expect(result).toBe(0);
      expect(ormRepo.manager.findOne).toHaveBeenCalledWith(
        BookingQuoteRevisionEntity,
        expect.objectContaining({
          where: { tenantId: TENANT, bookingId: BOOKING_ID },
          order: { revisionNo: 'DESC' },
        }),
      );
    });

    it('returns the latest revision_no when one exists', async () => {
      (ormRepo.manager.findOne as jest.Mock).mockResolvedValue(
        new BookingQuoteRevisionEntityBuilder().withRevisionNo(3).build(),
      );

      expect(await repo.findLatestRevisionNo(TENANT, BOOKING_ID)).toBe(3);
    });
  });

  describe('save', () => {
    it('inserts the entity with amount formatted to 2 decimals', async () => {
      const revision = BookingQuoteRevision.record({
        tenantId: TENANT,
        bookingId: BOOKING_ID,
        previousRevisionNo: 0,
        amount: Money.from(150, 'BRL'),
        reason: 'RESCHEDULE_DURATION_CHANGE',
        actorType: 'CUSTOMER',
        actorId: 'customer-1',
      });

      await repo.save(revision);

      expect(ormRepo.manager.insert).toHaveBeenCalledWith(
        BookingQuoteRevisionEntity,
        expect.objectContaining({
          tenantId: TENANT,
          bookingId: BOOKING_ID,
          revisionNo: 1,
          amount: '150.00',
          currency: 'BRL',
          reason: 'RESCHEDULE_DURATION_CHANGE',
          actorType: 'CUSTOMER',
          actorId: 'customer-1',
        }),
      );
    });
  });
});
