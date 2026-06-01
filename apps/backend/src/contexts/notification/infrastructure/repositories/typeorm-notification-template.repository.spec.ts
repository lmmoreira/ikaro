import { Test } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as transactionContext from '../../../../shared/infrastructure/transaction-context';
import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { NotificationTemplateEntity } from '../entities/notification-template.entity';
import { NotificationTemplateEntityBuilder } from '../../../../test/builders/notification/notification-template-entity.builder';
import { TypeOrmNotificationTemplateRepository } from './typeorm-notification-template.repository';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';

describe('TypeOrmNotificationTemplateRepository', () => {
  let repo: TypeOrmNotificationTemplateRepository;
  let ormRepo: jest.Mocked<
    Pick<Repository<NotificationTemplateEntity>, 'findOne' | 'find' | 'save'>
  >;
  let mockQuery: jest.Mock;

  beforeEach(async () => {
    mockQuery = jest.fn().mockResolvedValue({ rowCount: 16 });

    const moduleRef = await Test.createTestingModule({
      providers: [
        TypeOrmNotificationTemplateRepository,
        {
          provide: getRepositoryToken(NotificationTemplateEntity),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: { query: mockQuery },
        },
      ],
    }).compile();

    repo = moduleRef.get(TypeOrmNotificationTemplateRepository);
    ormRepo = moduleRef.get(getRepositoryToken(NotificationTemplateEntity));
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findByTriggerEventAndChannel', () => {
    it('returns null when no row found', async () => {
      (ormRepo.findOne as jest.Mock).mockResolvedValue(null);

      const result = await repo.findByTriggerEventAndChannel(
        TENANT_ID,
        NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
        'EMAIL',
      );

      expect(result).toBeNull();
    });

    it('maps entity to NotificationTemplate domain object', async () => {
      const entity = new NotificationTemplateEntityBuilder()
        .withTenantId(TENANT_ID)
        .withTriggerEvent(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER)
        .withSubject('Confirmado!')
        .withBody('<p>Ok</p>')
        .build();
      (ormRepo.findOne as jest.Mock).mockResolvedValue(entity);

      const result = await repo.findByTriggerEventAndChannel(
        TENANT_ID,
        NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
        'EMAIL',
      );

      expect(result).toBeInstanceOf(NotificationTemplate);
      expect(result!.tenantId).toBe(TENANT_ID);
      expect(result!.triggerEvent).toBe(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER);
      expect(result!.subject).toBe('Confirmado!');
    });

    it('passes correct where clause to findOne', async () => {
      (ormRepo.findOne as jest.Mock).mockResolvedValue(null);

      await repo.findByTriggerEventAndChannel(
        TENANT_ID,
        NotificationTemplateKey.STAFF_INVITATION,
        'EMAIL',
      );

      expect(ormRepo.findOne).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          triggerEvent: NotificationTemplateKey.STAFF_INVITATION,
          channel: 'EMAIL',
        },
      });
    });
  });

  describe('findAllDefaults', () => {
    it('returns empty array when no global defaults exist', async () => {
      (ormRepo.find as jest.Mock).mockResolvedValue([]);

      const result = await repo.findAllDefaults();

      expect(result).toEqual([]);
    });

    it('queries with tenant_id IS NULL', async () => {
      (ormRepo.find as jest.Mock).mockResolvedValue([]);

      await repo.findAllDefaults();

      expect(ormRepo.find).toHaveBeenCalledWith({ where: { tenantId: IsNull() } });
    });

    it('maps multiple entities to domain objects', async () => {
      const entities = [
        new NotificationTemplateEntityBuilder()
          .asGlobalDefault()
          .withTriggerEvent(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER)
          .withSubject('Aprovado')
          .withBody('<p>Ok</p>')
          .build(),
        new NotificationTemplateEntityBuilder()
          .asGlobalDefault()
          .withTriggerEvent(NotificationTemplateKey.STAFF_INVITATION)
          .withSubject('Convite')
          .withBody('<p>Olá</p>')
          .build(),
      ];
      (ormRepo.find as jest.Mock).mockResolvedValue(entities);

      const result = await repo.findAllDefaults();

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(NotificationTemplate);
      expect(result[0].tenantId).toBeNull();
      expect(result[1].triggerEvent).toBe(NotificationTemplateKey.STAFF_INVITATION);
    });
  });

  describe('saveAll', () => {
    it('persists all templates via TypeORM repo when no active manager', async () => {
      (ormRepo.save as jest.Mock).mockResolvedValue([]);
      const templates = [
        NotificationTemplate.create({
          tenantId: TENANT_ID,
          triggerEvent: NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
          channel: 'EMAIL',
          subject: 'Aprovado',
          body: '<p>Ok</p>',
        }),
      ];

      await repo.saveAll(templates);

      expect(ormRepo.save).toHaveBeenCalledTimes(1);
      const saved = (ormRepo.save as jest.Mock).mock.calls[0][0] as NotificationTemplateEntity[];
      expect(saved[0].triggerEvent).toBe(NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER);
    });

    it('uses active EntityManager when one is present', async () => {
      const mockManagerSave = jest.fn().mockResolvedValue([]);
      jest
        .spyOn(transactionContext, 'getActiveEntityManager')
        .mockReturnValue({ save: mockManagerSave } as never);

      const templates = [
        NotificationTemplate.create({
          tenantId: TENANT_ID,
          triggerEvent: NotificationTemplateKey.BOOKING_APPROVED_CUSTOMER,
          channel: 'EMAIL',
          subject: 'Aprovado',
          body: '<p>Ok</p>',
        }),
      ];

      await repo.saveAll(templates);

      expect(mockManagerSave).toHaveBeenCalledTimes(1);
      expect(ormRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('copyGlobalDefaultsForTenant', () => {
    it('executes INSERT...SELECT and returns rowCount', async () => {
      const result = await repo.copyGlobalDefaultsForTenant(TENANT_ID);

      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO'), [TENANT_ID]);
      expect(result).toBe(16);
    });

    it('uses ON CONFLICT DO NOTHING for idempotency', async () => {
      await repo.copyGlobalDefaultsForTenant(TENANT_ID);

      expect(mockQuery.mock.calls[0][0] as string).toContain('ON CONFLICT DO NOTHING');
    });

    it('returns 0 when query result has no rowCount', async () => {
      mockQuery.mockResolvedValueOnce(null);

      const result = await repo.copyGlobalDefaultsForTenant(TENANT_ID);

      expect(result).toBe(0);
    });

    it('returns 0 when rowCount is undefined', async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: undefined });

      const result = await repo.copyGlobalDefaultsForTenant(TENANT_ID);

      expect(result).toBe(0);
    });
  });
});
