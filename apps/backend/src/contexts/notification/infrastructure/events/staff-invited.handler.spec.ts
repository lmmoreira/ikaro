import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryNotificationDispatcher } from '../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationStaffPort } from '../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationTenantPort } from '../../../../test/infrastructure/in-memory-notification-tenant.port';
import { StaffInvitedEventBuilder } from '../../../../test/builders/staff/staff-invited-event.builder';
import { INotificationDispatcher } from '../../application/ports/notification-dispatcher.port';
import { SendStaffInvitationUseCase } from '../../application/use-cases/send-staff-invitation/send-staff-invitation.use-case';
import { StaffInvitedHandler } from './staff-invited.handler';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const STAFF_ID = 'bbbbbbbb-0000-4000-8000-000000000001';

describe('StaffInvitedHandler', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationTenantPort;
  let handler: StaffInvitedHandler;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    staffPort = new InMemoryNotificationStaffPort();
    staffPort.setStaff(TENANT_ID, { id: STAFF_ID, email: 'maria@lavacar.com.br', name: 'Maria' });
    tenantPort = new InMemoryNotificationTenantPort();
    tenantPort.setTenantInfo(TENANT_ID, { id: TENANT_ID, name: 'Lava Car', slug: 'lavacar' });
    const useCase = new SendStaffInvitationUseCase(
      logRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
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
      failingDispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
    );
    const failHandler = new StaffInvitedHandler(failUseCase, new InMemoryEventBus());

    await expect(failHandler.handle(new StaffInvitedEventBuilder().build())).rejects.toThrow(
      'SMTP down',
    );
  });
});
