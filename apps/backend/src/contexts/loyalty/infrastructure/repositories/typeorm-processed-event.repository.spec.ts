import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProcessedEventEntity } from '../entities/processed-event.entity';
import { TypeOrmProcessedEventRepository } from './typeorm-processed-event.repository';

const EVENT_ID = '00000000-0000-7000-8000-000000000010';
const CONSUMER_NAME = 'RECORD_LOYALTY_ENTRY';

describe('TypeOrmProcessedEventRepository', () => {
  let repo: TypeOrmProcessedEventRepository;
  let ormRepo: jest.Mocked<Repository<ProcessedEventEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmProcessedEventRepository,
        {
          provide: getRepositoryToken(ProcessedEventEntity),
          useValue: {
            count: jest.fn(),
            upsert: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmProcessedEventRepository);
    ormRepo = moduleRef.get(getRepositoryToken(ProcessedEventEntity));
  });

  describe('hasBeenProcessed()', () => {
    it('returns false when no row exists', async () => {
      ormRepo.count.mockResolvedValue(0);
      expect(await repo.hasBeenProcessed(EVENT_ID, CONSUMER_NAME)).toBe(false);
    });

    it('returns true when a row exists', async () => {
      ormRepo.count.mockResolvedValue(1);
      expect(await repo.hasBeenProcessed(EVENT_ID, CONSUMER_NAME)).toBe(true);
    });

    it('queries by eventId and consumerName', async () => {
      ormRepo.count.mockResolvedValue(0);
      await repo.hasBeenProcessed(EVENT_ID, CONSUMER_NAME);
      expect(ormRepo.count).toHaveBeenCalledWith({
        where: { eventId: EVENT_ID, consumerName: CONSUMER_NAME },
      });
    });
  });

  describe('markProcessed()', () => {
    it('upserts with eventId and consumerName', async () => {
      ormRepo.upsert.mockResolvedValue({ raw: [], generatedMaps: [], identifiers: [] });
      await repo.markProcessed(EVENT_ID, CONSUMER_NAME);
      expect(ormRepo.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: EVENT_ID, consumerName: CONSUMER_NAME }),
        ['eventId', 'consumerName'],
      );
    });
  });
});
