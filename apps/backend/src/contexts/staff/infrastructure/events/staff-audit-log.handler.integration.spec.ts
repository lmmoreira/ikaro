import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AuditLogModule } from '../../../../shared/infrastructure/audit-log/audit-log.module';
import { EventBusModule } from '../../../../shared/infrastructure/event-bus/event-bus.module';
import { InboxModule } from '../../../../shared/infrastructure/inbox/inbox.module';
import { InboxRecordEntity } from '../../../../shared/infrastructure/inbox/inbox-record.entity';
import { OutboxModule } from '../../../../shared/infrastructure/outbox/outbox.module';
import { TransactionManagerModule } from '../../../../shared/infrastructure/transaction-manager.module';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { EVENT_BUS } from '../../../../shared/ports/event-bus.port';
import { OUTBOX_PUBLISHER } from '../../../../shared/ports/outbox-publisher.port';
import { StaffEntityBuilder } from '../../../../test/builders/staff/staff-entity.builder';
import { RoutingInMemoryEventBus } from '../../../../test/infrastructure/routing-in-memory-event-bus';
import { testCacheModule } from '../../../../test/utils/test-cache-module';
import { testConfigModule } from '../../../../test/utils/test-config-module';
import { ActivateStaffUseCase } from '../../application/use-cases/activate-staff.use-case';
import { StaffModule } from '../../staff.module';
import { StaffEntity } from '../entities/staff.entity';

// M23-S36: StaffActivated shipped with no subscriber and therefore no Pub/Sub topic, so the
// outbox would fail to publish it once deployed (docs/ANTI_PATTERNS.md § A domain event is
// drained). This proves the event now reaches a real subscribed consumer — StaffAuditLogHandler —
// through the real ActivateStaffUseCase → repository → outbox path. RoutingInMemoryEventBus
// (unlike the plain InMemoryEventBus) actually dispatches to registered handlers.
describe('StaffAuditLogHandler (integration)', () => {
  let dataSource: DataSource;
  let activateStaff: ActivateStaffUseCase;
  let close: () => Promise<void>;

  const TENANT_A = uuidv7();
  const TENANT_B = uuidv7();

  beforeAll(async () => {
    const routingBus = new RoutingInMemoryEventBus();
    const moduleRef = await Test.createTestingModule({
      imports: [
        testConfigModule(),
        testCacheModule(),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: process.env['TEST_DATABASE_URL'],
          entities: [StaffEntity, InboxRecordEntity],
          synchronize: false,
        }),
        EventBusModule,
        OutboxModule,
        InboxModule,
        AuditLogModule,
        TransactionManagerModule,
        StaffModule,
      ],
    })
      .overrideProvider(EVENT_BUS)
      .useValue(routingBus)
      .overrideProvider(OUTBOX_PUBLISHER)
      .useValue(routingBus)
      .compile();

    const app = moduleRef.createNestApplication();
    await app.init();
    close = () => app.close();
    dataSource = moduleRef.get(DataSource);
    activateStaff = moduleRef.get(ActivateStaffUseCase, { strict: false });
  });

  afterAll(async () => {
    await close();
  });

  afterEach(() => jest.restoreAllMocks());

  async function seedDeactivatedStaff(tenantId: string): Promise<StaffEntity> {
    return dataSource
      .getRepository(StaffEntity)
      .save(
        new StaffEntityBuilder()
          .withTenantId(tenantId)
          .withEmail(`audit-${uuidv7()}@lavacar.com.br`)
          .withRole('STAFF')
          .withIsActive(false)
          .build(),
      );
  }

  function auditLogCalls(logSpy: jest.SpyInstance): { tenantId: string; eventId: string }[] {
    return logSpy.mock.calls
      .filter(([message]) => message === 'StaffActivated received')
      .map(([, metadata]) => metadata as { tenantId: string; eventId: string });
  }

  it('reactivating a staff member reaches the audit-log consumer exactly once', async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const staff = await seedDeactivatedStaff(TENANT_A);

    await activateStaff.execute({
      staffId: staff.id,
      tenantId: TENANT_A,
      activatedBy: uuidv7(),
      correlationId: uuidv7(),
    });

    const calls = auditLogCalls(logSpy);
    expect(calls).toHaveLength(1);
    expect(calls[0].tenantId).toBe(TENANT_A);
  });

  it("tenant isolation: each tenant's event logs its own tenantId and never the other's", async () => {
    const logSpy = jest.spyOn(AppLogger.prototype, 'log').mockImplementation();
    const staffA = await seedDeactivatedStaff(TENANT_A);
    const staffB = await seedDeactivatedStaff(TENANT_B);

    await activateStaff.execute({
      staffId: staffA.id,
      tenantId: TENANT_A,
      activatedBy: uuidv7(),
      correlationId: uuidv7(),
    });
    await activateStaff.execute({
      staffId: staffB.id,
      tenantId: TENANT_B,
      activatedBy: uuidv7(),
      correlationId: uuidv7(),
    });

    expect(auditLogCalls(logSpy).map((call) => call.tenantId)).toEqual([TENANT_A, TENANT_B]);
  });
});
