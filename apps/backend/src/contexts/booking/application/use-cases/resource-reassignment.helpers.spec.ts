import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  BookingBuilder,
  BookingLineBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import {
  FCE_TENANT_ID as TENANT_ID,
  FutureCommitmentFixture,
} from '../../../../test/utils/future-commitment-fixture';
import { FutureCommitmentExceptionReassignTargetInvalidError } from '../../domain/errors/future-commitment-exception.error';
import { AvailabilityService } from '../../domain/services/availability.service';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { reassignBookingResource } from './resource-reassignment.helpers';

const TIMEZONE = 'America/Sao_Paulo';

describe('reassignBookingResource', () => {
  let world: FutureCommitmentFixture;

  beforeEach(() => {
    world = new FutureCommitmentFixture();
  });

  const deps = () => ({
    resourceRepo: world.resourceRepo,
    occupancyRepo: world.occupancyRepo,
    tenantLock: world.tenantLock,
    availabilityService: new AvailabilityService(),
  });

  // A booking whose one line needs a room AND a piece of equipment (a bundle), with one occupancy
  // row on each — plus, optionally, a second room unit.
  async function seedBundle(options: { secondRoomUnit?: boolean } = {}) {
    const room = await world.addResource('Sala 1');
    const equipment = await world.addResource('Projetor', ResourceType.EQUIPMENT);
    const otherRoom = options.secondRoomUnit ? await world.addResource('Sala 9') : null;
    const service = new ServiceBuilder()
      .withTenantId(TENANT_ID)
      .withBufferAfterMinutes(0)
      .withResourceRequirements([
        ResourceRequirement.create({
          type: ResourceType.ROOM,
          selectionMode: 'AUTO_ANY',
          requiredQuantity: options.secondRoomUnit ? 2 : 1,
        }),
        ResourceRequirement.create({ type: ResourceType.EQUIPMENT, selectionMode: 'AUTO_ANY' }),
      ])
      .build();
    await world.serviceRepo.save(service);

    const startsAt = new Date(Date.now() + 48 * 3_600_000);
    const endsAt = new Date(startsAt.getTime() + 3_600_000);
    const lineId = uuidv7();
    const booking = new BookingBuilder()
      .withTenantId(TENANT_ID)
      .withScheduledAt(startsAt)
      .withLines([
        new BookingLineBuilder()
          .withLineId(lineId)
          .withTenantId(TENANT_ID)
          .withServiceId(service.id)
          .withDurationMinsAtBooking(60)
          .build(),
      ])
      .build();
    await world.bookingRepo.save(booking);

    const candidate = (
      resource: { id: string; type: ResourceType; name: string },
      quantityPosition: number | null,
    ) => ({
      resourceId: resource.id,
      resourceType: resource.type,
      resourceName: resource.name,
      legIndex: null,
      quantityPosition,
      startsAt,
      endsAt,
      selectionMode: 'AUTO_ANY' as const,
      isBundleMember: true,
      gapMinutes: null,
      gapSource: null,
    });
    await world.occupancyRepo.assign(
      TENANT_ID,
      lineId,
      [
        candidate(room, otherRoom ? 1 : null),
        ...(otherRoom ? [candidate(otherRoom, 2)] : []),
        candidate(equipment, null),
      ],
      'COMMITTED',
      null,
    );
    return { booking, service, room, equipment, otherRoom };
  }

  async function occupancy(bookingLineIds: string[]) {
    return world.occupancyRepo.findOccupancyByBookingLines(TENANT_ID, bookingLineIds);
  }

  it("moves only the source resource's row and leaves a bundle's other resources untouched", async () => {
    const { booking, service, room, equipment } = await seedBundle();
    const target = await world.addResource('Sala 2');
    const lineIds = booking.lines.map((l) => l.lineId);

    const { targetResourceId } = await reassignBookingResource(deps(), {
      tenantId: TENANT_ID,
      booking,
      serviceMap: new Map([[service.id, service]]),
      sourceResourceId: room.id,
      target: { resourceId: target.id },
      timezone: TIMEZONE,
    });

    expect(targetResourceId).toBe(target.id);
    const rows = await occupancy(lineIds);
    expect(rows.map((r) => r.resourceId).sort()).toEqual([target.id, equipment.id].sort());
    const moved = rows.find((r) => r.resourceId === target.id)!;
    const kept = rows.find((r) => r.resourceId === equipment.id)!;
    expect(moved.resourceName).toBe('Sala 2');
    expect(moved.startsAt).toEqual(kept.startsAt);
    expect(moved.endsAt).toEqual(kept.endsAt);
    expect(kept.resourceName).toBe('Projetor');
  });

  it('locks the candidate resources before checking them', async () => {
    const { booking, service, room } = await seedBundle();
    const target = await world.addResource('Sala 2');
    const lockSpy = jest.spyOn(world.tenantLock, 'lockResources');
    const conflictSpy = jest.spyOn(world.occupancyRepo, 'findConflictingWindows');

    await reassignBookingResource(deps(), {
      tenantId: TENANT_ID,
      booking,
      serviceMap: new Map([[service.id, service]]),
      sourceResourceId: room.id,
      target: { resourceId: target.id },
      timezone: TIMEZONE,
    });

    expect(lockSpy).toHaveBeenCalledWith(TENANT_ID, [target.id]);
    expect(lockSpy.mock.invocationCallOrder[0]).toBeLessThan(
      conflictSpy.mock.invocationCallOrder[0],
    );
  });

  it('never picks a resource the booking already uses when choosing AUTO', async () => {
    const { booking, service, room, otherRoom } = await seedBundle({ secondRoomUnit: true });
    const spare = await world.addResource('Sala 3');

    const { targetResourceId } = await reassignBookingResource(deps(), {
      tenantId: TENANT_ID,
      booking,
      serviceMap: new Map([[service.id, service]]),
      sourceResourceId: room.id,
      target: { mode: 'AUTO' },
      timezone: TIMEZONE,
    });

    expect(targetResourceId).toBe(spare.id);
    expect(targetResourceId).not.toBe(otherRoom!.id);
  });

  it('rejects an explicit target the booking already uses', async () => {
    const { booking, service, room, otherRoom } = await seedBundle({ secondRoomUnit: true });

    await expect(
      reassignBookingResource(deps(), {
        tenantId: TENANT_ID,
        booking,
        serviceMap: new Map([[service.id, service]]),
        sourceResourceId: room.id,
        target: { resourceId: otherRoom!.id },
        timezone: TIMEZONE,
      }),
    ).rejects.toThrow(FutureCommitmentExceptionReassignTargetInvalidError);
  });

  it('rejects an unknown target resource', async () => {
    const { booking, service, room } = await seedBundle();

    await expect(
      reassignBookingResource(deps(), {
        tenantId: TENANT_ID,
        booking,
        serviceMap: new Map([[service.id, service]]),
        sourceResourceId: room.id,
        target: { resourceId: '00000000-0000-7000-8000-00000000dead' },
        timezone: TIMEZONE,
      }),
    ).rejects.toThrow('does not exist');
  });

  it('rejects when the booking no longer occupies the source resource', async () => {
    const { booking, service } = await seedBundle();
    const stranger = await world.addResource('Sala 7');
    const target = await world.addResource('Sala 2');

    await expect(
      reassignBookingResource(deps(), {
        tenantId: TENANT_ID,
        booking,
        serviceMap: new Map([[service.id, service]]),
        sourceResourceId: stranger.id,
        target: { resourceId: target.id },
        timezone: TIMEZONE,
      }),
    ).rejects.toThrow('no longer occupies');
  });

  it('reports "no eligible resource" for AUTO when the tenant has no other room', async () => {
    const { booking, service, room } = await seedBundle();

    await expect(
      reassignBookingResource(deps(), {
        tenantId: TENANT_ID,
        booking,
        serviceMap: new Map([[service.id, service]]),
        sourceResourceId: room.id,
        target: { mode: 'AUTO' },
        timezone: TIMEZONE,
      }),
    ).rejects.toThrow('no eligible resource');
  });

  describe('gap recomputation for the target resource (M18-S10)', () => {
    async function seedSingleRoom(roomTurnover: number, serviceBuffer: number) {
      const room = await world.addResourceWithTurnover('Sala 1', roomTurnover);
      const service = new ServiceBuilder()
        .withTenantId(TENANT_ID)
        .withBufferAfterMinutes(serviceBuffer)
        .withResourceRequirements([
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ])
        .build();
      await world.serviceRepo.save(service);
      const startsAt = new Date(Date.now() + 48 * 3_600_000);
      const lineId = uuidv7();
      const booking = new BookingBuilder()
        .withTenantId(TENANT_ID)
        .withScheduledAt(startsAt)
        .withLines([
          new BookingLineBuilder()
            .withLineId(lineId)
            .withTenantId(TENANT_ID)
            .withServiceId(service.id)
            .withDurationMinsAtBooking(60)
            .build(),
        ])
        .build();
      await world.bookingRepo.save(booking);
      const availability = new AvailabilityService();
      const gap = availability.resolveFlatGap(serviceBuffer, roomTurnover);
      await world.occupancyRepo.assign(
        TENANT_ID,
        lineId,
        [
          {
            resourceId: room.id,
            resourceType: room.type,
            resourceName: room.name,
            legIndex: null,
            quantityPosition: null,
            startsAt,
            endsAt: new Date(startsAt.getTime() + 3_600_000 + (gap?.minutes ?? 0) * 60_000),
            gapMinutes: gap?.minutes ?? null,
            gapSource: gap?.source ?? null,
            selectionMode: 'AUTO_ANY' as const,
            isBundleMember: false,
          },
        ],
        'COMMITTED',
        null,
      );
      return { booking, service, room, startsAt, lineId };
    }

    const reassign = (seed: Awaited<ReturnType<typeof seedSingleRoom>>, targetId: string) =>
      reassignBookingResource(deps(), {
        tenantId: TENANT_ID,
        booking: seed.booking,
        serviceMap: new Map([[seed.service.id, seed.service]]),
        sourceResourceId: seed.room.id,
        target: { resourceId: targetId },
        timezone: TIMEZONE,
      });

    it("rewrites ends_at and the origin from the target's turnover when it is the larger gap", async () => {
      const seed = await seedSingleRoom(30, 0);
      const target = await world.addResourceWithTurnover('Sala 2', 15);

      await reassign(seed, target.id);

      const [row] = await occupancy([seed.lineId]);
      expect(row.resourceId).toBe(target.id);
      expect(row.endsAt).toEqual(new Date(seed.startsAt.getTime() + 75 * 60_000));
      expect(row.gapMinutes).toBe(15);
      expect(row.gapSource).toBe('RESOURCE_TURNOVER');
    });

    it('turns a turnover gap into no gap when the target has no turnover', async () => {
      const seed = await seedSingleRoom(30, 0);
      const target = await world.addResourceWithTurnover('Sala 2', 0);

      await reassign(seed, target.id);

      const [row] = await occupancy([seed.lineId]);
      expect(row.endsAt).toEqual(new Date(seed.startsAt.getTime() + 60 * 60_000));
      expect(row.gapMinutes).toBeNull();
      expect(row.gapSource).toBeNull();
    });

    it('keeps a service buffer that still dominates the target turnover', async () => {
      const seed = await seedSingleRoom(0, 60);
      const target = await world.addResourceWithTurnover('Sala 2', 20);

      await reassign(seed, target.id);

      const [row] = await occupancy([seed.lineId]);
      expect(row.endsAt).toEqual(new Date(seed.startsAt.getTime() + 120 * 60_000));
      expect(row.gapMinutes).toBe(60);
      expect(row.gapSource).toBe('SERVICE_BUFFER');
    });

    it("refuses a target whose recomputed window collides with that target's next booking", async () => {
      const seed = await seedSingleRoom(0, 0);
      const target = await world.addResourceWithTurnover('Sala 2', 45);
      // Free for the raw hour, busy 30 minutes after it: only the recomputed 45-minute gap hits it.
      await world.occupancyRepo.assign(
        TENANT_ID,
        uuidv7(),
        [
          {
            resourceId: target.id,
            resourceType: target.type,
            resourceName: target.name,
            legIndex: null,
            quantityPosition: null,
            startsAt: new Date(seed.startsAt.getTime() + 90 * 60_000),
            endsAt: new Date(seed.startsAt.getTime() + 150 * 60_000),
            gapMinutes: null,
            gapSource: null,
            selectionMode: 'AUTO_ANY' as const,
            isBundleMember: false,
          },
        ],
        'COMMITTED',
        null,
      );

      await expect(reassign(seed, target.id)).rejects.toThrow('busy at this time');
    });
  });
});
