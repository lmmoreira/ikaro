import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmTransactionManager } from '../../../../shared/infrastructure/typeorm-transaction-manager';
import { OutboxEventEntity } from '../../../../shared/infrastructure/outbox/outbox-event.entity';
import { TypeOrmOutboxRepository } from '../../../../shared/infrastructure/outbox/typeorm-outbox.repository';
import {
  AvailabilityAlertEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { makeRealOutboxPublisher } from '../../../../test/factories/real-outbox-publisher.factory';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { createTestDataSource } from '../../../../test/test-datasource';
import { AvailabilityAlert } from '../../domain/availability-alert.aggregate';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { AvailabilityAlertEntity } from '../../infrastructure/entities/availability-alert.entity';
import { ServiceEntity } from '../../infrastructure/entities/service.entity';
import { TypeOrmAvailabilityAlertRepository } from '../../infrastructure/repositories/typeorm-availability-alert.repository';
import { ExpireAvailabilityAlertsJob } from './expire-availability-alerts.job';

const HOUR_MS = 3_600_000;

// Proves the expiry job against real rows and the real outbox: only past-expiresAt ACTIVE alerts
// change, each tenant's alerts stay in their tenant, the version-checked UPDATE and the outbox
// write commit together, and the (tenant_id, status, expires_at) query is tenant-scoped.
describe('ExpireAvailabilityAlertsJob (integration)', () => {
  let ds: DataSource;
  let job: ExpireAvailabilityAlertsJob;
  let alertRepo: TypeOrmAvailabilityAlertRepository;
  const tenantA = uuidv7();
  const tenantB = uuidv7();
  const serviceIds = new Map<string, string>();

  beforeAll(async () => {
    ds = await createTestDataSource();
    for (const tenantId of [tenantA, tenantB]) {
      const service = await ds
        .getRepository(ServiceEntity)
        .save(
          new ServiceEntityBuilder()
            .withTenantId(tenantId)
            .withAvailabilityAlertEligible(true)
            .build(),
        );
      serviceIds.set(tenantId, service.id);
    }
    const platformPort = new InMemoryBookingPlatformPort();
    platformPort.seed([
      { id: tenantA, timezone: 'America/Sao_Paulo' },
      { id: tenantB, timezone: 'UTC' },
    ]);
    const txManager = new TypeOrmTransactionManager(ds);
    const outboxRepo = new TypeOrmOutboxRepository(ds.getRepository(OutboxEventEntity));
    alertRepo = new TypeOrmAvailabilityAlertRepository(
      ds.getRepository(AvailabilityAlertEntity),
      makeRealOutboxPublisher(outboxRepo, new InMemoryEventBus()),
    );
    job = new ExpireAvailabilityAlertsJob(platformPort, alertRepo, txManager);
  });

  afterAll(async () => {
    for (const tenantId of [tenantA, tenantB]) {
      await ds.getRepository(OutboxEventEntity).delete({ tenantId });
      await ds.getRepository(AvailabilityAlertEntity).delete({ tenantId });
      await ds.getRepository(ServiceEntity).delete({ tenantId });
    }
    await ds.destroy();
  });

  const seedAlert = async (
    tenantId: string,
    expiresAt: Date,
    status: 'ACTIVE' | 'NOTIFIED' = 'ACTIVE',
  ): Promise<string> => {
    const entity = new AvailabilityAlertEntityBuilder()
      .withTenantId(tenantId)
      .withServiceId(serviceIds.get(tenantId) as string)
      .withExpiresAt(expiresAt)
      .withStatus(status)
      .build();
    await ds.getRepository(AvailabilityAlertEntity).save(entity);
    return entity.id;
  };

  const rowOf = (tenantId: string, id: string) =>
    ds.getRepository(AvailabilityAlertEntity).findOneByOrFail({ tenantId, id });

  it('expires only the overdue ACTIVE alerts of every tenant and writes one outbox row each', async () => {
    const overdueA = await seedAlert(tenantA, new Date(Date.now() - HOUR_MS));
    const overdueB = await seedAlert(tenantB, new Date(Date.now() - 2 * HOUR_MS));
    const waitingA = await seedAlert(tenantA, new Date(Date.now() + HOUR_MS));
    const notifiedA = await seedAlert(tenantA, new Date(Date.now() - HOUR_MS), 'NOTIFIED');

    const result = await job.run();

    expect(result.expired).toBe(2);
    const expiredA = await rowOf(tenantA, overdueA);
    expect(expiredA.status).toBe('EXPIRED');
    expect(expiredA.version).toBe(2);
    expect((await rowOf(tenantB, overdueB)).status).toBe('EXPIRED');
    expect((await rowOf(tenantA, waitingA)).status).toBe('ACTIVE');
    expect((await rowOf(tenantA, notifiedA)).status).toBe('NOTIFIED');
    const outbox = await ds
      .getRepository(OutboxEventEntity)
      .find({ where: [{ tenantId: tenantA }, { tenantId: tenantB }] });
    const expiredEvents = outbox.filter((row) => row.eventName === 'AvailabilityAlertExpired');
    expect(expiredEvents.map((row) => row.tenantId).sort()).toEqual([tenantA, tenantB].sort());
  });

  it('loses to a concurrent cancel: a stale save fails the version check and writes no outbox row', async () => {
    const id = await seedAlert(tenantB, new Date(Date.now() - HOUR_MS));
    const stale = await alertRepo.findById(id, tenantB);
    // The customer's cancel commits first and bumps the version.
    await ds
      .getRepository(AvailabilityAlertEntity)
      .update({ tenantId: tenantB, id }, { status: 'CANCELLED', version: 2 });
    stale?.expire('corr-stale');

    await expect(alertRepo.save(stale as AvailabilityAlert)).rejects.toThrow(
      BookingConcurrentModificationError,
    );

    expect((await rowOf(tenantB, id)).status).toBe('CANCELLED');
    const outbox = await ds.getRepository(OutboxEventEntity).find({ where: { tenantId: tenantB } });
    expect(outbox.filter((row) => row.payload['alertId'] === id)).toEqual([]);
    expect((await job.run()).expired).toBe(0);
  });

  it('is a no-op on a second run (nothing left to expire)', async () => {
    await seedAlert(tenantA, new Date(Date.now() - HOUR_MS));
    await job.run();

    const second = await job.run();

    expect(second.expired).toBe(0);
  });
});
