import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as transactionContext from '../../../../shared/infrastructure/transaction-context';
import { NotificationLog } from '../../domain/notification-log.entity';
import { NotificationLogEntity } from '../entities/notification-log.entity';
import { TypeOrmNotificationLogRepository } from './typeorm-notification-log.repository';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const EVENT_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

const BASE_CREATE_PROPS = {
  tenantId: TENANT_ID,
  eventId: EVENT_ID,
  notificationType: 'booking-approved-customer',
  channel: 'EMAIL',
  recipientEmail: 'joao@example.com',
};

describe('TypeOrmNotificationLogRepository', () => {
  let repo: TypeOrmNotificationLogRepository;
  let ormRepo: jest.Mocked<Repository<NotificationLogEntity>>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmNotificationLogRepository,
        {
          provide: getRepositoryToken(NotificationLogEntity),
          useValue: {
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmNotificationLogRepository);
    ormRepo = moduleRef.get(getRepositoryToken(NotificationLogEntity));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('save', () => {
    it('persists a SENT log via TypeORM save', async () => {
      ormRepo.save.mockResolvedValue({} as NotificationLogEntity);
      const log = NotificationLog.create(BASE_CREATE_PROPS);
      log.markSent();

      await repo.save(log);

      expect(ormRepo.save).toHaveBeenCalledTimes(1);
      const saved = ormRepo.save.mock.calls[0][0] as NotificationLogEntity;
      expect(saved.tenantId).toBe(TENANT_ID);
      expect(saved.eventId).toBe(EVENT_ID);
      expect(saved.notificationType).toBe('booking-approved-customer');
      expect(saved.channel).toBe('EMAIL');
      expect(saved.recipientEmail).toBe('joao@example.com');
      expect(saved.status).toBe('SENT');
      expect(saved.retryCount).toBe(0);
    });

    it('persists a FAILED log with errorMessage', async () => {
      ormRepo.save.mockResolvedValue({} as NotificationLogEntity);
      const log = NotificationLog.create(BASE_CREATE_PROPS);
      log.markFailed('SMTP timeout');

      await repo.save(log);

      const saved = ormRepo.save.mock.calls[0][0] as NotificationLogEntity;
      expect(saved.status).toBe('FAILED');
      expect(saved.errorMessage).toBe('SMTP timeout');
      expect(saved.retryCount).toBe(1);
    });

    it('uses active EntityManager when one is present', async () => {
      const mockManagerSave = jest.fn().mockResolvedValue({});
      jest
        .spyOn(transactionContext, 'getActiveEntityManager')
        .mockReturnValue({ save: mockManagerSave } as never);

      const log = NotificationLog.create(BASE_CREATE_PROPS);
      log.markSent();

      await repo.save(log);

      expect(mockManagerSave).toHaveBeenCalledTimes(1);
      expect(ormRepo.save).not.toHaveBeenCalled();
    });
  });
});
