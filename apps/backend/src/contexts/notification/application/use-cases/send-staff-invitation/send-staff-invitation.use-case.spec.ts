import { ConfigService } from '@nestjs/config';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationProcessedEventRepository } from '../../../../../test/repositories/notification/in-memory-processed-event.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationPlatformPort } from '../../../../../test/infrastructure/in-memory-notification-platform.port';
import { InMemoryNotificationTemplateRepository } from '../../../../../test/repositories/notification/in-memory-notification-template.repository';
import { InMemoryLocalizationPort } from '../../../../../test/infrastructure/in-memory-localization.port';
import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { SendStaffInvitationDtoBuilder } from '../../../../../test/builders/notification/index';
import { NotificationTemplate } from '../../../domain/notification-template.aggregate';
import { NotificationTemplateKey } from '../../../domain/notification-template-key.enum';
import { SendStaffInvitationUseCase } from './send-staff-invitation.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const STAFF_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0000-4000-8000-000000000001';

const configService = {
  getOrThrow: (key: string): string => {
    if (key === 'FRONTEND_URL') return 'http://localhost:3000';
    throw new Error(`Unknown config key: ${key}`);
  },
} as unknown as ConfigService;

const dto = new SendStaffInvitationDtoBuilder()
  .withTenantId(TENANT_ID)
  .withEventId(EVENT_ID)
  .build();

describe('SendStaffInvitationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let processedEventRepo: InMemoryNotificationProcessedEventRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationPlatformPort;
  let templateRepo: InMemoryNotificationTemplateRepository;
  let useCase: SendStaffInvitationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    processedEventRepo = new InMemoryNotificationProcessedEventRepository();
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
    const localizationPort = new InMemoryLocalizationPort();
    localizationPort.setTemplate('StaffInvited:staff', {
      subject: 'Você foi convidado para a equipe {{tenantName}}',
      body: '<p>Olá, {{staffName}}! <a href="{{activationLink}}">Acessar</a></p>',
    });
    useCase = new SendStaffInvitationUseCase(
      logRepo,
      processedEventRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
      templateRepo,
      localizationPort,
      configService,
    );
  });

  it('dispatches an email and saves a notification log', async () => {
    const result = await useCase.execute(dto);

    expect(result.sent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('maria@lavacar.com.br');
    expect(msg.subject).toContain('Lava Car');
    expect(msg.body).toContain('Maria');
    expect(msg.body).toContain('lavacar/auth/staff');

    const logs = logRepo.all;
    expect(logs).toHaveLength(1);
    expect(logs[0].tenantId).toBe(TENANT_ID);
    expect(logs[0].eventId).toBe(EVENT_ID);
    expect(logs[0].notificationType).toBe('staff-invitation');
    expect(logs[0].channel).toBe('EMAIL');
  });

  it('is idempotent: second call with same eventId returns sent=false without dispatching', async () => {
    await useCase.execute(dto);
    const result = await useCase.execute(dto);

    expect(result.sent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it('returns sent=false and does not dispatch when staff is not found', async () => {
    const result = await useCase.execute(
      new SendStaffInvitationDtoBuilder()
        .withTenantId(TENANT_ID)
        .withEventId(EVENT_ID)
        .withStaffId('unknown-staff-id')
        .build(),
    );

    expect(result.sent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('returns sent=false and does not dispatch when tenant is not found', async () => {
    const result = await useCase.execute(
      new SendStaffInvitationDtoBuilder()
        .withTenantId('unknown-tenant-id')
        .withEventId(EVENT_ID)
        .build(),
    );

    expect(result.sent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('tenant isolation: log is scoped to the correct tenantId', async () => {
    await useCase.execute(dto);
    expect(logRepo.all[0].tenantId).toBe(TENANT_ID);
  });
});
