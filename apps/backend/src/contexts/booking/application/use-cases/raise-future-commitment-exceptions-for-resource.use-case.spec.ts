import {
  FCE_OTHER_TENANT_ID,
  FCE_TENANT_ID as TENANT_ID,
  FutureCommitmentFixture,
} from '../../../../test/utils/future-commitment-fixture';
import { BookingStatus } from '../../domain/booking.aggregate';
import { FutureCommitmentExceptionRaised } from '../../domain/events/future-commitment-exception-raised.event';
import { ResourceType } from '../../domain/resource.types';

const CORRELATION_ID = 'corr-raise-1';

describe('RaiseFutureCommitmentExceptionsForResourceUseCase', () => {
  let world: FutureCommitmentFixture;

  beforeEach(() => {
    world = new FutureCommitmentFixture();
  });

  const raise = (resourceId: string) =>
    world.raise.execute({ tenantId: TENANT_ID, resourceId, correlationId: CORRELATION_ID });

  it('raises one entry per affected booking whatever its live status', async () => {
    const resource = await world.addResource('Sala 1');
    const service = await world.addService();
    const pending = await world.addBooking({
      service,
      resource,
      status: BookingStatus.PENDING,
      lockState: 'HOLD',
      startsInHours: 24,
    });
    const infoRequested = await world.addBooking({
      service,
      resource,
      status: BookingStatus.INFO_REQUESTED,
      lockState: 'HOLD',
      startsInHours: 48,
    });
    const approved = await world.addBooking({
      service,
      resource,
      status: BookingStatus.APPROVED,
      startsInHours: 72,
    });

    const result = await raise(resource.id);

    expect(result.raisedCount).toBe(3);
    const entries = await world.exceptionRepo.findByTenant(TENANT_ID, { status: 'OPEN' });
    expect(entries.map((e) => e.affectedId).sort()).toEqual(
      [pending.id, infoRequested.id, approved.id].sort(),
    );
    for (const entry of entries) {
      expect(entry.sourceType).toBe('RESOURCE_DEACTIVATION');
      expect(entry.sourceId).toBe(resource.id);
      expect(entry.affectedType).toBe('BOOKING');
      expect(entry.ownerStaffId).toBeNull();
    }
  });

  it('skips terminal bookings, past windows and REQUESTED-lock rows', async () => {
    const resource = await world.addResource('Sala 1');
    const service = await world.addService();
    await world.addBooking({ service, resource, status: BookingStatus.CANCELLED });
    await world.addBooking({ service, resource, status: BookingStatus.COMPLETED });
    await world.addBooking({ service, resource, status: BookingStatus.REJECTED });
    await world.addBooking({ service, resource, startsInHours: -72 });
    await world.addBooking({ service, resource, lockState: 'REQUESTED' });
    const live = await world.addBooking({ service, resource, startsInHours: 10 });

    const result = await raise(resource.id);

    expect(result.raisedCount).toBe(1);
    const entries = await world.exceptionRepo.findByTenant(TENANT_ID);
    expect(entries.map((e) => e.affectedId)).toEqual([live.id]);
  });

  it('raises nothing for a resource without future bookings', async () => {
    const resource = await world.addResource('Sala 1');

    const result = await raise(resource.id);

    expect(result.raisedCount).toBe(0);
    expect(await world.exceptionRepo.findByTenant(TENANT_ID)).toHaveLength(0);
  });

  it("ignores another resource's bookings", async () => {
    const resource = await world.addResource('Sala 1');
    const other = await world.addResource('Sala 2');
    const service = await world.addService();
    await world.addBooking({ service, resource: other });

    const result = await raise(resource.id);

    expect(result.raisedCount).toBe(0);
  });

  it('computes the free, same-type, in-pool resources as advisory alternatives', async () => {
    const source = await world.addResource('Sala 1');
    const free = await world.addResource('Sala 2');
    const busy = await world.addResource('Sala 3');
    const outsidePool = await world.addResource('Sala 4');
    const service = await world.addService(source.type, [source.id, free.id, busy.id]);
    const booking = await world.addBooking({ service, resource: source, startsInHours: 24 });
    await world.addBooking({ service, resource: busy, startsInHours: 24 });

    await raise(source.id);

    const [entry] = await world.exceptionRepo.findByTenant(TENANT_ID);
    expect(entry.affectedId).toBe(booking.id);
    expect(entry.alternatives).toEqual([{ resourceId: free.id, resourceName: 'Sala 2' }]);
    expect(entry.alternatives.map((a) => a.resourceId)).not.toContain(outsidePool.id);
  });

  it('leaves the alternatives empty when no compatible resource exists', async () => {
    const source = await world.addResource('Sala 1');
    const service = await world.addService();
    await world.addBooking({ service, resource: source });

    await raise(source.id);

    const [entry] = await world.exceptionRepo.findByTenant(TENANT_ID);
    expect(entry.status).toBe('OPEN');
    expect(entry.alternatives).toEqual([]);
  });

  it('never offers an inactive resource or one of another type', async () => {
    const source = await world.addResource('Sala 1');
    const inactive = await world.addResource('Sala 2');
    inactive.deactivate();
    await world.resourceRepo.save(inactive);
    await world.addResource('Instrutor', ResourceType.STAFF);
    const service = await world.addService();
    await world.addBooking({ service, resource: source });

    await raise(source.id);

    const [entry] = await world.exceptionRepo.findByTenant(TENANT_ID);
    expect(entry.alternatives).toEqual([]);
  });

  it('is idempotent — a repeated raise refreshes the open entry instead of duplicating it', async () => {
    const source = await world.addResource('Sala 1');
    const service = await world.addService();
    await world.addBooking({ service, resource: source });

    await raise(source.id);
    const [first] = await world.exceptionRepo.findByTenant(TENANT_ID);
    await world.addResource('Sala 2');
    await raise(source.id);

    const entries = await world.exceptionRepo.findByTenant(TENANT_ID);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(first.id);
    expect(entries[0].alternatives.map((a) => a.resourceName)).toEqual(['Sala 2']);
  });

  it('acquires the resource lock before reading the impacts', async () => {
    const source = await world.addResource('Sala 1');
    const lockSpy = jest.spyOn(world.tenantLock, 'lockResources');
    const readSpy = jest.spyOn(world.occupancyRepo, 'findFutureBookingImpactsByResource');

    await raise(source.id);

    expect(lockSpy).toHaveBeenCalledWith(TENANT_ID, [source.id]);
    expect(lockSpy.mock.invocationCallOrder[0]).toBeLessThan(readSpy.mock.invocationCallOrder[0]);
  });

  it('publishes FutureCommitmentExceptionRaised for a new entry only', async () => {
    const published: unknown[] = [];
    const observed = new FutureCommitmentFixture({
      publish: async (event: unknown) => {
        published.push(event);
      },
    });
    const source = await observed.addResource('Sala 1');
    const service = await observed.addService();
    await observed.addBooking({ service, resource: source });

    await observed.raise.execute({
      tenantId: TENANT_ID,
      resourceId: source.id,
      correlationId: CORRELATION_ID,
    });
    await observed.raise.execute({
      tenantId: TENANT_ID,
      resourceId: source.id,
      correlationId: CORRELATION_ID,
    });

    expect(published).toHaveLength(1);
    expect(published[0]).toBeInstanceOf(FutureCommitmentExceptionRaised);
  });

  it('does not read another tenant’s bookings (tenant isolation)', async () => {
    const source = await world.addResource('Sala 1');
    const service = await world.addService();
    await world.addBooking({ service, resource: source });

    const result = await world.raise.execute({
      tenantId: FCE_OTHER_TENANT_ID,
      resourceId: source.id,
      correlationId: CORRELATION_ID,
    });

    expect(result.raisedCount).toBe(0);
    expect(await world.exceptionRepo.findByTenant(FCE_OTHER_TENANT_ID)).toHaveLength(0);
  });
});
