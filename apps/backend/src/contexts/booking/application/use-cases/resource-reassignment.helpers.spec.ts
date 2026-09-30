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
  });

  // A booking whose one line needs a room AND a piece of equipment (a bundle), with one occupancy
  // row on each — plus, optionally, a second room unit.
  async function seedBundle(options: { secondRoomUnit?: boolean } = {}) {
    const room = await world.addResource('Sala 1');
    const equipment = await world.addResource('Projetor', ResourceType.EQUIPMENT);
    const otherRoom = options.secondRoomUnit ? await world.addResource('Sala 9') : null;
    const service = new ServiceBuilder()
      .withTenantId(TENANT_ID)
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
});
