import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as transactionContext from '../../../../shared/infrastructure/transaction-context';
import { NotificationProcessedEventEntity } from '../entities/processed-event.entity';
import { TypeOrmNotificationProcessedEventRepository } from './typeorm-processed-event.repository';

const EVENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const NOTIFICATION_TYPE = 'booking-approved-customer';
const CHANNEL = 'EMAIL';

describe('TypeOrmNotificationProcessedEventRepository', () => {
  let repo: TypeOrmNotificationProcessedEventRepository;
  let ormRepo: jest.Mocked<Repository<NotificationProcessedEventEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmNotificationProcessedEventRepository,
        {
          provide: getRepositoryToken(NotificationProcessedEventEntity),
          useValue: {
            count: jest.fn(),
            upsert: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmNotificationProcessedEventRepository);
    ormRepo = moduleRef.get(getRepositoryToken(NotificationProcessedEventEntity));
  });

  describe('isDuplicate', () => {
    it('returns false when count is 0', async () => {
      ormRepo.count.mockResolvedValue(0);

      const result = await repo.isDuplicate(EVENT_ID, NOTIFICATION_TYPE, CHANNEL);

      expect(result).toBe(false);
      expect(ormRepo.count).toHaveBeenCalledWith({
        where: { eventId: EVENT_ID, notificationType: NOTIFICATION_TYPE, channel: CHANNEL },
      });
    });

    it('returns true when count is 1', async () => {
      ormRepo.count.mockResolvedValue(1);

      const result = await repo.isDuplicate(EVENT_ID, NOTIFICATION_TYPE, CHANNEL);

      expect(result).toBe(true);
    });
  });

  describe('markProcessed', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('upserts with composite conflict paths via repo when no active manager', async () => {
      ormRepo.upsert.mockResolvedValue({ raw: [], generatedMaps: [], identifiers: [] });

      await repo.markProcessed(EVENT_ID, NOTIFICATION_TYPE, CHANNEL);

      expect(ormRepo.upsert).toHaveBeenCalledTimes(1);
      const [entity, conflictPaths] = ormRepo.upsert.mock.calls[0];
      expect((entity as NotificationProcessedEventEntity).eventId).toBe(EVENT_ID);
      expect((entity as NotificationProcessedEventEntity).notificationType).toBe(NOTIFICATION_TYPE);
      expect((entity as NotificationProcessedEventEntity).channel).toBe(CHANNEL);
      expect(conflictPaths).toEqual(['eventId', 'notificationType', 'channel']);
    });

    it('uses active EntityManager when one is present', async () => {
      const mockManagerUpsert = jest.fn().mockResolvedValue({ raw: [] });
      jest
        .spyOn(transactionContext, 'getActiveEntityManager')
        .mockReturnValue({ upsert: mockManagerUpsert } as never);

      await repo.markProcessed(EVENT_ID, NOTIFICATION_TYPE, CHANNEL);

      expect(mockManagerUpsert).toHaveBeenCalledTimes(1);
      expect(ormRepo.upsert).not.toHaveBeenCalled();
    });
  });
});
