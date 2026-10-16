import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TRANSACTION_MANAGER } from '../../../../shared/ports/transaction-manager.port';
import {
  ResourceEntityBuilder,
  ScheduleOpeningEntityBuilder,
} from '../../../../test/builders/booking/index';
import { StaffEntityBuilder } from '../../../../test/builders/staff';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import {
  createLockRaceWorld,
  databaseNow,
  holdResourceLocks,
  holdTransaction,
  LockRaceEnv,
  LockRaceWorld,
  waitForBlockedLock,
} from '../../../../test/utils/booking-lock-race-world';
import { FULL_WEEK_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import { futureDate } from '../../../../test/utils/date-helpers';
import { StaffEntity } from '../../../staff/infrastructure/entities/staff.entity';
import { ClosureReason } from '../../domain/schedule-closure.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { ScheduleAlreadyClosedError } from '../../domain/errors/booking-schedule.error';
import { FutureCommitmentExceptionEntity } from '../../infrastructure/entities/future-commitment-exception.entity';
import { ResourceEntity } from '../../infrastructure/entities/resource.entity';
import { ScheduleClosureEntity } from '../../infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../../infrastructure/entities/schedule-opening.entity';
import { RESOURCE_OCCUPANCY_REPOSITORY } from '../ports/resource-occupancy-repository.port';
import { TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { CascadeStaffDeactivationUseCase } from './cascade-staff-deactivation.use-case';
import { CloseScheduleUseCase } from './close-schedule.use-case';
import { CreateResourceUseCase } from './create-resource.use-case';
import { DeactivateResourceUseCase } from './deactivate-resource.use-case';
import { ReactivateResourceUseCase } from './reactivate-resource.use-case';
import { RemoveScheduleOpeningUseCase } from './remove-schedule-opening.use-case';

const MANAGER_ID = '20000000-0000-4000-8000-0000000000e1';

// The locks that predate M23-S48 (docs/28-LOCK_CATALOG.md § 3.1): the staff wrapper, the tenant
// day and the resource lock taken by a deactivation. Same lock-contract pattern
// as booking-lock-order.integration.spec.ts, one tenant world per scenario: hold the lock, start
// the use case, prove it waits, release, check the result. Two of them also check the OUTCOME the
// lock protects, because nothing else does (a closure overlap has no database constraint).
describe('booking context locks (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let env: LockRaceEnv;
  let createResource: CreateResourceUseCase;
  let reactivateResource: ReactivateResourceUseCase;
  let deactivateResource: DeactivateResourceUseCase;
  let cascade: CascadeStaffDeactivationUseCase;
  let closeSchedule: CloseScheduleUseCase;
  let removeOpening: RemoveScheduleOpeningUseCase;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    env = {
      ds,
      txManager: app.get(TRANSACTION_MANAGER),
      occupancyRepo: app.get(RESOURCE_OCCUPANCY_REPOSITORY),
      tenantLock: app.get(TENANT_LOCK_PORT),
    };
    createResource = app.get(CreateResourceUseCase);
    reactivateResource = app.get(ReactivateResourceUseCase);
    deactivateResource = app.get(DeactivateResourceUseCase);
    cascade = app.get(CascadeStaffDeactivationUseCase);
    closeSchedule = app.get(CloseScheduleUseCase);
    removeOpening = app.get(RemoveScheduleOpeningUseCase);
  });

  afterAll(async () => {
    await app.close();
  });

  interface Held {
    release: () => Promise<void>;
  }
  interface Prepared {
    lockKind: 'advisory' | 'row';
    hold: () => Promise<Held>;
    start: () => Promise<unknown>;
    verify: () => Promise<void>;
  }
  interface Case {
    name: string;
    prepare: (world: LockRaceWorld) => Promise<Prepared>;
  }

  const seedStaff = async (tenantId: string): Promise<StaffEntity> =>
    ds
      .getRepository(StaffEntity)
      .save(
        new StaffEntityBuilder()
          .withTenantId(tenantId)
          .withEmail(`staff-${uuidv7()}@lavacar.com.br`)
          .withRole('STAFF')
          .withIsActive(true)
          .build(),
      );

  const seedStaffResource = async (
    tenantId: string,
    staffId: string,
    isActive: boolean,
  ): Promise<ResourceEntity> =>
    ds
      .getRepository(ResourceEntity)
      .save(
        new ResourceEntityBuilder()
          .withTenantId(tenantId)
          .withType(ResourceType.STAFF)
          .withRefId(staffId)
          .withIsActive(isActive)
          .build(),
      );

  const holdStaff = (world: LockRaceWorld, staffId: string) => () =>
    holdTransaction(env, () => env.tenantLock.lockTenantStaff(world.tenantId, staffId));

  const cases: Case[] = [
    {
      name: 'creating a staff member’s resource waits for the staff lock (A2)',
      prepare: async (world) => {
        const staff = await seedStaff(world.tenantId);
        return {
          lockKind: 'advisory',
          hold: holdStaff(world, staff.id),
          start: () =>
            createResource.execute({
              tenantId: world.tenantId,
              tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
              type: ResourceType.STAFF,
              refId: staff.id,
              name: 'Camila',
            }),
          verify: async () => {
            const wrapper = await ds
              .getRepository(ResourceEntity)
              .findOneBy({ tenantId: world.tenantId, refId: staff.id });
            expect(wrapper?.isActive).toBe(true);
          },
        };
      },
    },
    {
      name: 'reactivating a staff member’s resource waits for the staff lock (A2, then A3)',
      prepare: async (world) => {
        const staff = await seedStaff(world.tenantId);
        const wrapper = await seedStaffResource(world.tenantId, staff.id, false);
        return {
          lockKind: 'advisory',
          hold: holdStaff(world, staff.id),
          start: () =>
            reactivateResource.execute({
              id: wrapper.id,
              tenantId: world.tenantId,
              staffId: MANAGER_ID,
              correlationId: uuidv7(),
            }),
          verify: async () => {
            const row = await ds.getRepository(ResourceEntity).findOneByOrFail({ id: wrapper.id });
            expect(row.isActive).toBe(true);
          },
        };
      },
    },
    {
      name: 'the staff-deactivated cascade waits for the staff lock (A2)',
      prepare: async (world) => {
        const staff = await seedStaff(world.tenantId);
        const wrapper = await seedStaffResource(world.tenantId, staff.id, true);
        return {
          lockKind: 'advisory',
          hold: holdStaff(world, staff.id),
          start: () =>
            cascade.execute({
              tenantId: world.tenantId,
              staffId: staff.id,
              eventId: uuidv7(),
              correlationId: uuidv7(),
            }),
          verify: async () => {
            const row = await ds.getRepository(ResourceEntity).findOneByOrFail({ id: wrapper.id });
            expect(row.isActive).toBe(false);
          },
        };
      },
    },
    {
      name: 'deactivating a resource waits for its resource lock, then raises the booking’s entry (A3)',
      prepare: async (world) => {
        const { bookingId } = await world.seedBooking({ resources: [world.roomA] });
        await ds
          .getRepository(FutureCommitmentExceptionEntity)
          .delete({ tenantId: world.tenantId });
        return {
          lockKind: 'advisory',
          hold: () => holdResourceLocks(env, world.tenantId, [world.roomA.id]),
          start: () =>
            deactivateResource.execute({
              id: world.roomA.id,
              tenantId: world.tenantId,
              correlationId: uuidv7(),
            }),
          verify: async () => {
            const room = await ds
              .getRepository(ResourceEntity)
              .findOneByOrFail({ id: world.roomA.id });
            expect(room.isActive).toBe(false);
            const entries = await ds
              .getRepository(FutureCommitmentExceptionEntity)
              .find({ where: { tenantId: world.tenantId, affectedId: bookingId, status: 'OPEN' } });
            expect(entries.map((entry) => entry.sourceId)).toEqual([world.roomA.id]);
          },
        };
      },
    },
    {
      name: 'closing a day waits for the tenant-day lock (A1)',
      prepare: async (world) => {
        const date = futureDate(12);
        return {
          lockKind: 'advisory',
          hold: () =>
            holdTransaction(env, () => env.tenantLock.lockTenantDay(world.tenantId, date)),
          start: () =>
            closeSchedule.execute({
              tenantId: world.tenantId,
              createdBy: MANAGER_ID,
              date,
              reason: ClosureReason.HOLIDAY,
            }),
          verify: async () => {
            expect(
              await ds
                .getRepository(ScheduleClosureEntity)
                .count({ where: { tenantId: world.tenantId } }),
            ).toBe(1);
          },
        };
      },
    },
    {
      name: 'removing a tenant-wide opening waits for the tenant-day lock (A1)',
      prepare: async (world) => {
        const date = futureDate(13);
        const opening = await ds
          .getRepository(ScheduleOpeningEntity)
          .save(
            new ScheduleOpeningEntityBuilder()
              .withTenantId(world.tenantId)
              .withResourceId(null)
              .withDate(date)
              .build(),
          );
        return {
          lockKind: 'advisory',
          hold: () =>
            holdTransaction(env, () => env.tenantLock.lockTenantDay(world.tenantId, date)),
          start: () => removeOpening.execute({ id: opening.id, tenantId: world.tenantId }),
          verify: async () => {
            expect(
              await ds
                .getRepository(ScheduleOpeningEntity)
                .count({ where: { tenantId: world.tenantId } }),
            ).toBe(0);
          },
        };
      },
    },
  ];

  describe('lock contract: the use case waits for the lock, then completes', () => {
    it.each(cases.map(({ name, prepare }) => ({ name, prepare })))('$name', async ({ prepare }) => {
      const world = await createLockRaceWorld(env);
      const run = await prepare(world);
      const held = await run.hold();
      try {
        const since = await databaseNow(ds);
        let finished = false;
        const operation = run.start().then((result) => {
          finished = true;
          return result;
        });
        await Promise.race([
          waitForBlockedLock(ds, run.lockKind, since),
          operation.then(() => {
            throw new Error('the use case finished without ever waiting for the lock');
          }),
        ]);
        expect(finished).toBe(false);

        await held.release();
        await operation;
        await run.verify();
      } finally {
        await held.release();
      }
    });
  });

  describe('outcome: what the tenant-day lock protects', () => {
    // A closure overlap has no database constraint (docs/13-DATABASE_SCHEMA.md § schedule_closures),
    // so the lock is the only thing that stops two overlapping closures from both passing the check.
    it('two overlapping closures of the same day: exactly one is created', async () => {
      for (let round = 0; round < 3; round++) {
        const world = await createLockRaceWorld(env);
        const date = futureDate(14);
        const close = () =>
          closeSchedule.execute({
            tenantId: world.tenantId,
            createdBy: MANAGER_ID,
            date,
            reason: ClosureReason.HOLIDAY,
          });

        const results = await Promise.allSettled([close(), close()]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.find((result) => result.status === 'rejected');
        expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(
          ScheduleAlreadyClosedError,
        );
        expect(
          await ds
            .getRepository(ScheduleClosureEntity)
            .count({ where: { tenantId: world.tenantId } }),
        ).toBe(1);
      }
    });
  });
});
