import { DataSource } from 'typeorm';
import { uuidv7 } from '../../shared/domain/uuid-v7';
import { ITransactionManager } from '../../shared/ports/transaction-manager.port';
import { IResourceOccupancyRepository } from '../../contexts/booking/application/ports/resource-occupancy-repository.port';
import { ITenantLockPort } from '../../contexts/booking/application/ports/tenant-lock.port';
import { ResourceType } from '../../contexts/booking/domain/resource.types';
import { BookingEntity } from '../../contexts/booking/infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../contexts/booking/infrastructure/entities/booking-line.entity';
import { FutureCommitmentExceptionEntity } from '../../contexts/booking/infrastructure/entities/future-commitment-exception.entity';
import { RecurringBookingScheduleEntity } from '../../contexts/booking/infrastructure/entities/recurring-booking-schedule.entity';
import { ResourceEntity } from '../../contexts/booking/infrastructure/entities/resource.entity';
import { TenantEntity } from '../../contexts/platform/infrastructure/entities/tenant.entity';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  FutureCommitmentExceptionEntityBuilder,
  RecurringBookingScheduleEntityBuilder,
} from '../builders/booking/index';
import { TenantEntityBuilder } from '../builders/platform/tenant-entity.builder';
import { futureDate } from './date-helpers';
import { seedResource, seedService } from './future-commitment-db-fixture';

// Concurrency integration tests (docs/08-TESTING_STRATEGY.md § Concurrency tests). Every scenario
// builds its OWN world: a fresh tenant id, two rooms and one service that needs a room. Nothing is
// shared between scenarios, so a failure never leaves rows another test can trip over, no cleanup
// is needed on the reused test database, and the scenarios stay independent of their order.

export interface LockRaceEnv {
  ds: DataSource;
  txManager: ITransactionManager;
  occupancyRepo: IResourceOccupancyRepository;
  tenantLock: ITenantLockPort;
}

export interface SeedBookingOptions {
  resources: ResourceEntity[];
  status?: 'APPROVED' | 'PENDING';
  customerId?: string;
  recurringScheduleId?: string;
  startsInDays?: number;
}

export interface LockRaceWorld {
  tenantId: string;
  roomA: ResourceEntity;
  roomB: ResourceEntity;
  serviceId: string;
  // A booking that occupies the given resources, with one open worklist entry per resource.
  seedBooking(options: SeedBookingOptions): Promise<{ bookingId: string; entryIds: string[] }>;
  seedSchedule(customerId: string): Promise<string>;
  // What the deactivation of a resource leaves behind, without raising entries.
  deactivate(resource: ResourceEntity): Promise<void>;
}

export interface LockRaceWorldOptions {
  // How the world's service picks its room: automatically, or the customer chooses.
  selectionMode?: 'AUTO_ANY' | 'CUSTOMER_CHOICE';
}

export async function createLockRaceWorld(
  env: LockRaceEnv,
  options: LockRaceWorldOptions = {},
): Promise<LockRaceWorld> {
  const { ds, txManager, occupancyRepo } = env;
  const tenantId = uuidv7();
  // The events these flows publish are handled by listeners that read the tenant's settings.
  await ds
    .getRepository(TenantEntity)
    .save(new TenantEntityBuilder().withId(tenantId).withSlug(`lock-race-${tenantId}`).build());
  const roomA = await seedResource(ds, tenantId, 'Sala A');
  const roomB = await seedResource(ds, tenantId, 'Sala B');
  const serviceId = (await seedService(ds, tenantId, { selectionMode: options.selectionMode })).id;

  return {
    tenantId,
    roomA,
    roomB,
    serviceId,
    async seedBooking(options) {
      const startsAt = new Date(`${futureDate(options.startsInDays ?? 5)}T13:00:00.000Z`);
      const endsAt = new Date(startsAt.getTime() + 30 * 60_000);
      const status = options.status ?? 'APPROVED';
      const booking = await ds.getRepository(BookingEntity).save(
        new BookingEntityBuilder()
          .withTenantId(tenantId)
          .withStatus(status)
          .withCustomerId(options.customerId ?? uuidv7())
          .withRecurringScheduleId(options.recurringScheduleId ?? null)
          .withScheduledAt(startsAt)
          .withTotalDurationMins(30)
          .withTotalPriceAmount('100.00')
          .build(),
      );
      const line = await ds
        .getRepository(BookingLineEntity)
        .save(
          new BookingLineEntityBuilder()
            .withBookingId(booking.id)
            .withTenantId(tenantId)
            .withServiceId(serviceId)
            .withPriceAtBookingAmount('100.00')
            .withDurationMinsAtBooking(30)
            .build(),
        );
      await txManager.run(() =>
        occupancyRepo.assign(
          tenantId,
          line.lineId,
          options.resources.map((resource, index) => ({
            resourceId: resource.id,
            resourceType: ResourceType.ROOM,
            resourceName: resource.name,
            legIndex: null,
            quantityPosition: index,
            selectionMode: 'AUTO_ANY' as const,
            isBundleMember: false,
            gapMinutes: null,
            gapSource: null,
            startsAt,
            endsAt,
          })),
          status === 'PENDING' ? 'HOLD' : 'COMMITTED',
          status === 'PENDING' ? new Date(Date.now() + 3_600_000) : null,
        ),
      );
      const entryIds: string[] = [];
      for (const resource of options.resources) {
        const entry = await ds
          .getRepository(FutureCommitmentExceptionEntity)
          .save(
            new FutureCommitmentExceptionEntityBuilder()
              .withTenantId(tenantId)
              .withSourceId(resource.id)
              .withAffectedId(booking.id)
              .build(),
          );
        entryIds.push(entry.id);
      }
      return { bookingId: booking.id, entryIds };
    },
    async seedSchedule(customerId) {
      const schedule = await ds
        .getRepository(RecurringBookingScheduleEntity)
        .save(
          new RecurringBookingScheduleEntityBuilder()
            .withTenantId(tenantId)
            .withCustomerId(customerId)
            .withServiceId(serviceId)
            .withStatus('ACTIVE')
            .build(),
        );
      return schedule.id;
    },
    async deactivate(resource) {
      await ds
        .getRepository(ResourceEntity)
        .update({ id: resource.id, tenantId }, { isActive: false });
    },
  };
}

// What a concurrent transaction does first: take the advisory lock of some resources and keep it
// until released. The operation under test, started meanwhile, has to wait for it.
export function holdResourceLocks(
  env: LockRaceEnv,
  tenantId: string,
  resourceIds: string[],
): Promise<{ release: () => Promise<void> }> {
  return holdTransaction(env, () => env.tenantLock.lockResources(tenantId, resourceIds));
}

// Keeps a transaction open after `acquire` took its lock (an advisory lock, or a row lock such as
// SELECT ... FOR UPDATE) until `release()`.
export function holdTransaction(
  env: LockRaceEnv,
  acquire: () => Promise<unknown>,
): Promise<{ release: () => Promise<void> }> {
  return new Promise((resolveHeld, rejectHeld) => {
    let letGo!: () => void;
    const released = new Promise<void>((resolveRelease) => (letGo = resolveRelease));
    const holder: { done?: Promise<void> } = {};
    holder.done = env.txManager.run(async () => {
      await acquire();
      resolveHeld({
        release: async () => {
          letGo();
          await holder.done;
        },
      });
      await released;
    });
    holder.done.catch(rejectHeld);
  });
}

// Polls Postgres until a session that started after `since` waits for a lock: the operation
// reached it and is blocked behind the holder. Fails fast instead of hanging when it never does.
export async function waitForBlockedLock(
  ds: DataSource,
  kind: 'advisory' | 'row',
  since: Date,
): Promise<void> {
  const waitEvent = kind === 'advisory' ? 'advisory' : 'transactionid';
  for (let attempt = 0; attempt < 150; attempt++) {
    const [{ waiting }] = await ds.query<{ waiting: number }[]>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND wait_event = $1 AND query_start >= $2`,
      [waitEvent, since],
    );
    if (waiting > 0) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error(`no session ever blocked on a ${kind} lock`);
}

// The database's own clock, taken just before the operation under test starts, so the probe above
// only counts sessions that began waiting after that moment (never one left over from elsewhere).
export async function databaseNow(ds: DataSource): Promise<Date> {
  const [{ now }] = await ds.query<{ now: Date }[]>(`SELECT clock_timestamp() AS now`);
  return now;
}

// True when nobody holds a row lock on the entry (SELECT ... FOR UPDATE NOWAIT fails otherwise):
// a blocked operation must be waiting for the RESOURCE lock without already owning the entry.
export async function entryRowIsFree(
  ds: DataSource,
  tenantId: string,
  entryId: string,
): Promise<boolean> {
  try {
    await ds.transaction((manager) =>
      manager.query(
        `SELECT id FROM booking.future_commitment_exceptions
          WHERE id = $1 AND tenant_id = $2 FOR UPDATE NOWAIT`,
        [entryId, tenantId],
      ),
    );
    return true;
  } catch {
    return false;
  }
}

// True when the advisory lock for a resource is free right now (and releases the probe at once).
export async function resourceLockIsFree(
  ds: DataSource,
  tenantId: string,
  resourceId: string,
): Promise<boolean> {
  const rows = await ds.transaction((manager) =>
    manager.query<{ free: boolean }[]>(
      `SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 0::bigint)) AS free`,
      [`resource:${tenantId}:${resourceId}`],
    ),
  );
  return rows[0].free;
}

export async function entryStatus(
  ds: DataSource,
  tenantId: string,
  entryId: string,
): Promise<string | undefined> {
  return (
    await ds
      .getRepository(FutureCommitmentExceptionEntity)
      .findOne({ where: { id: entryId, tenantId } })
  )?.status;
}

export function openEntriesOf(ds: DataSource, tenantId: string, bookingId: string) {
  return ds
    .getRepository(FutureCommitmentExceptionEntity)
    .find({ where: { tenantId, affectedId: bookingId, status: 'OPEN' } });
}

export async function bookingStatus(
  ds: DataSource,
  tenantId: string,
  bookingId: string,
): Promise<string> {
  return (await ds.getRepository(BookingEntity).findOneByOrFail({ id: bookingId, tenantId }))
    .status;
}
