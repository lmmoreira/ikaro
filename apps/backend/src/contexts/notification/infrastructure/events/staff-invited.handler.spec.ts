import { ConfigService } from '@nestjs/config';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryInboxRepository } from '../../../../test/infrastructure/in-memory-inbox.repository';
import { InMemoryNotificationStaffPort } from '../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationPlatformPort } from '../../../../test/infrastructure/in-memory-notification-platform.port';
import { StaffInvitedEventBuilder } from '../../../../test/builders/staff/staff-invited-event.builder';
import { InMemoryNotificationTemplateRepository } from '../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryLocalizationPort } from '../../../../test/infrastructure/in-memory-localization.port';
import { NotificationTemplate } from '../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../domain/notification-template-key.enum';
import { INotificationDispatcher } from '../../application/ports/notification-dispatcher.port';
import { SendStaffInvitationUseCase } from '../../application/use-cases/send-staff-invitation/send-staff-invitation.use-case';
import { StaffInvitedHandler } from './staff-invited.handler';

const configService = {
  getOrThrow: (key: string): string => {
    if (key === 'FRONTEND_URL') return 'http://localhost:3000';
    throw new Error(`Unknown config key: ${key}`);
  },
} as unknown as ConfigService;

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const STAFF_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('StaffInvitedHandler', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let inboxRepo: InMemoryInboxRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let localizationPort: InMemoryLocalizationPort;
  let handler: StaffInvitedHandler;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    inboxRepo = new InMemoryInboxRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    staffPort = new InMemoryNotificationStaffPort();
    staffPort.setStaff(TENANT_ID, { id: STAFF_ID, email: 'maria@lavacar.com.br', name: 'Maria' });
    tenantPort = new InMemoryNotificationPlatformPort();
    tenantPort.setTenantInfo(TENANT_ID, {
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      fromEmail: null,
    });
    templateRepo = new InMemoryNotificationTemplateRepository();
    templateRepo.seed(
      NotificationTemplate.create({
        tenantId: TENANT_ID,
        triggerEvent: NotificationTemplateKey.STAFF_INVITATION,
        channel: 'EMAIL',
        locale: 'pt-BR',
        subject: 'DB SUBJECT (unused)',
        body: 'DB BODY (unused)',
      }),
    );
    localizationPort = new InMemoryLocalizationPort();
    localizationPort.setTemplate('StaffInvited:staff', {
      subject: 'Você foi convidado para a equipe {{tenantName}}',
      body: '<p>Olá, {{staffName}}! <a href="{{activationLink}}">Acessar</a></p>',
    });
    const useCase = new SendStaffInvitationUseCase(
      logRepo,
      inboxRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      localizationPort,
      configService,
    );
    handler = new StaffInvitedHandler(useCase, new InMemoryEventBus());
    handler.onModuleInit();
  });

  it('delegates to SendStaffInvitationUseCase and dispatches email', async () => {
    await handler.handle(new StaffInvitedEventBuilder().build());

    expect(dispatcher.dispatched).toHaveLength(1);
    expect(dispatcher.dispatched[0].to).toBe('maria@lavacar.com.br');
    expect(logRepo.all).toHaveLength(1);
  });

  it('is idempotent: same event delivered twice dispatches email only once', async () => {
    const event = new StaffInvitedEventBuilder().build();

    await handler.handle(event);
    await handler.handle(event);

    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it('handles invitedBy = SYSTEM_ACTOR_ID (provisioning case) without error', async () => {
    staffPort.setStaff(TENANT_ID, { id: STAFF_ID, email: 'admin@tenant.com.br', name: null });

    await expect(handler.handle(new StaffInvitedEventBuilder().build())).resolves.not.toThrow();
    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it('rethrows use case errors so Pub/Sub can nack and retry', async () => {
    const failingDispatcher: INotificationDispatcher = {
      dispatch: async () => {
        throw new Error('SMTP down');
      },
    };
    const failUseCase = new SendStaffInvitationUseCase(
      new InMemoryNotificationLogRepository(),
      new InMemoryInboxRepository(),
      failingDispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      localizationPort,
      configService,
    );
    const failHandler = new StaffInvitedHandler(failUseCase, new InMemoryEventBus());

    await expect(failHandler.handle(new StaffInvitedEventBuilder().build())).rejects.toThrow(
      'SMTP down',
    );
  });
});
