import { InMemoryTransactionManager } from '../../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryNotificationDispatcher } from '../../../../../test/infrastructure/in-memory-notification-dispatcher';
import { InMemoryNotificationLogRepository } from '../../../../../test/repositories/notification/in-memory-notification-log.repository';
import { InMemoryNotificationStaffPort } from '../../../../../test/infrastructure/in-memory-notification-staff.port';
import { InMemoryNotificationTenantPort } from '../../../../../test/infrastructure/in-memory-notification-tenant.port';
import { SendStaffInvitationUseCase } from './send-staff-invitation.use-case';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const STAFF_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const EVENT_ID = 'cccccccc-0000-4000-8000-000000000001';

const dto = {
  staffId: STAFF_ID,
  tenantId: TENANT_ID,
  eventId: EVENT_ID,
  correlationId: 'corr-1',
};

describe('SendStaffInvitationUseCase', () => {
  let logRepo: InMemoryNotificationLogRepository;
  let dispatcher: InMemoryNotificationDispatcher;
  let staffPort: InMemoryNotificationStaffPort;
  let tenantPort: InMemoryNotificationTenantPort;
  let useCase: SendStaffInvitationUseCase;

  beforeEach(() => {
    logRepo = new InMemoryNotificationLogRepository();
    dispatcher = new InMemoryNotificationDispatcher();
    staffPort = new InMemoryNotificationStaffPort();
    staffPort.setStaff(TENANT_ID, { id: STAFF_ID, email: 'maria@lavacar.com.br', name: 'Maria' });
    tenantPort = new InMemoryNotificationTenantPort();
    tenantPort.setTenantInfo(TENANT_ID, { id: TENANT_ID, name: 'Lava Car', slug: 'lavacar' });
    useCase = new SendStaffInvitationUseCase(
      logRepo,
      dispatcher,
      staffPort,
      tenantPort,
      new InMemoryTransactionManager(),
    );
  });

  it('dispatches an email and saves a notification log', async () => {
    const result = await useCase.execute(dto);

    expect(result.sent).toBe(true);
    expect(dispatcher.dispatched).toHaveLength(1);

    const msg = dispatcher.dispatched[0];
    expect(msg.to).toBe('maria@lavacar.com.br');
    expect(msg.subject).toContain('Lava Car');
    expect(msg.templateKey).toBe('staff-invitation');
    expect(msg.data['tenantName']).toBe('Lava Car');
    expect(msg.data['activationLink']).toContain('lavacar');

    const logs = logRepo.all;
    expect(logs).toHaveLength(1);
    expect(logs[0].tenantId).toBe(TENANT_ID);
    expect(logs[0].eventId).toBe(EVENT_ID);
    expect(logs[0].notificationType).toBe('STAFF_INVITED');
    expect(logs[0].channel).toBe('EMAIL');
  });

  it('is idempotent: second call with same eventId returns sent=false without dispatching', async () => {
    await useCase.execute(dto);
    const result = await useCase.execute(dto);

    expect(result.sent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(1);
  });

  it('returns sent=false and does not dispatch when staff is not found', async () => {
    const result = await useCase.execute({ ...dto, staffId: 'unknown-staff-id' });

    expect(result.sent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('returns sent=false and does not dispatch when tenant is not found', async () => {
    const result = await useCase.execute({ ...dto, tenantId: 'unknown-tenant-id' });

    expect(result.sent).toBe(false);
    expect(dispatcher.dispatched).toHaveLength(0);
  });

  it('tenant isolation: log is scoped to the correct tenantId', async () => {
    await useCase.execute(dto);

    expect(logRepo.all[0].tenantId).toBe(TENANT_ID);
  });
});
