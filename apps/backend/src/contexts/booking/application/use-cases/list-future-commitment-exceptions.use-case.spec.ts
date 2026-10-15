import { FutureCommitmentExceptionBuilder } from '../../../../test/builders/booking/index';
import {
  FCE_OTHER_TENANT_ID,
  FCE_TENANT_ID as TENANT_ID,
  FutureCommitmentFixture,
} from '../../../../test/utils/future-commitment-fixture';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { Money } from '../../../../shared/value-objects/money';
import { BookingStatus } from '../../domain/booking.aggregate';
import { ListFutureCommitmentExceptionsUseCase } from './list-future-commitment-exceptions.use-case';

const STAFF_ID = '00000000-0000-7000-8000-0000000000aa';

describe('ListFutureCommitmentExceptionsUseCase', () => {
  let world: FutureCommitmentFixture;
  let useCase: ListFutureCommitmentExceptionsUseCase;

  beforeEach(() => {
    world = new FutureCommitmentFixture();
    useCase = new ListFutureCommitmentExceptionsUseCase(
      world.exceptionRepo,
      world.bookingRepo,
      world.resourceRepo,
      world.serviceRepo,
      world.occupancyRepo,
      new InMemoryTransactionManager(),
    );
  });

  async function raiseFor(resourceId: string): Promise<void> {
    await world.raise.execute({ tenantId: TENANT_ID, resourceId, correlationId: 'corr-list-1' });
  }

  it("carries each entry's booking summary and the affected resource name, earliest booking first", async () => {
    const source = await world.addResource('Sala 1');
    const alternative = await world.addResource('Sala 2');
    const service = await world.addService();
    const later = await world.addBooking({ service, resource: source, startsInHours: 72 });
    const sooner = await world.addBooking({
      service,
      resource: source,
      startsInHours: 24,
      durationMins: 45,
      status: BookingStatus.PENDING,
      lockState: 'HOLD',
    });
    await raiseFor(source.id);

    const { items } = await useCase.execute({ tenantId: TENANT_ID, status: 'OPEN' });

    expect(items.map((i) => i.affectedId)).toEqual([sooner.id, later.id]);
    expect(items[0]).toEqual(
      expect.objectContaining({
        sourceType: 'RESOURCE_DEACTIVATION',
        sourceId: source.id,
        affectedType: 'BOOKING',
        status: 'OPEN',
        alternatives: [{ resourceId: alternative.id, resourceName: 'Sala 2' }],
      }),
    );
    expect(items[0].booking).toEqual({
      contactName: 'João Silva',
      scheduledAt: sooner.scheduledAt.toISOString(),
      totalDurationMins: 45,
      serviceNames: [service.name],
      status: 'PENDING',
      resourceName: 'Sala 1',
      isCustomer: false,
      totalPrice: { amount: 100, currency: 'BRL' },
    });
  });

  it('stops offering an alternative that was deactivated after the entry was raised', async () => {
    const source = await world.addResource('Sala 1');
    const alternative = await world.addResource('Sala 2');
    const service = await world.addService();
    await world.addBooking({ service, resource: source, startsInHours: 24 });
    await raiseFor(source.id);
    alternative.deactivate();
    await world.resourceRepo.save(alternative);

    const { items } = await useCase.execute({ tenantId: TENANT_ID, status: 'OPEN' });

    expect(items[0].alternatives).toEqual([]);
  });

  it('offers a resource reactivated after the entry was raised (alternatives are recomputed, not stored)', async () => {
    const source = await world.addResource('Sala 1');
    const later = await world.addResource('Sala 2');
    later.deactivate();
    await world.resourceRepo.save(later);
    const service = await world.addService();
    await world.addBooking({ service, resource: source, startsInHours: 24 });
    await raiseFor(source.id);
    expect(
      (await useCase.execute({ tenantId: TENANT_ID, status: 'OPEN' })).items[0].alternatives,
    ).toEqual([]);

    later.reactivate();
    await world.resourceRepo.save(later);

    const { items } = await useCase.execute({ tenantId: TENANT_ID, status: 'OPEN' });
    expect(items[0].alternatives).toEqual([{ resourceId: later.id, resourceName: 'Sala 2' }]);
  });

  it('drops an alternative that another booking has taken at that time since the entry was raised', async () => {
    const source = await world.addResource('Sala 1');
    const alternative = await world.addResource('Sala 2');
    const service = await world.addService();
    await world.addBooking({ service, resource: source, startsInHours: 24 });
    await raiseFor(source.id);
    await world.addBooking({ service, resource: alternative, startsInHours: 24 });

    const { items } = await useCase.execute({ tenantId: TENANT_ID, status: 'OPEN' });

    expect(items[0].alternatives).toEqual([]);
  });

  it("flags a registered customer's booking and carries its total price (the queue card's pills and price)", async () => {
    const source = await world.addResource('Sala 1');
    const service = await world.addService();
    await world.addBooking({
      service,
      resource: source,
      customerId: '00000000-0000-7000-8000-0000000000c1',
      totalPrice: Money.from(250.5, 'BRL'),
    });
    await world.addBooking({ service, resource: source, startsInHours: 72 });
    await raiseFor(source.id);

    const { items } = await useCase.execute({ tenantId: TENANT_ID, status: 'OPEN' });

    expect(items[0].booking).toMatchObject({
      isCustomer: true,
      totalPrice: { amount: 250.5, currency: 'BRL' },
    });
    expect(items[1].booking).toMatchObject({ isCustomer: false });
  });

  it('filters by status', async () => {
    const source = await world.addResource('Sala 1');
    const service = await world.addService();
    await world.addBooking({ service, resource: source, startsInHours: 24 });
    await world.addBooking({ service, resource: source, startsInHours: 48 });
    await raiseFor(source.id);
    const [first] = await world.exceptionRepo.findByTenant(TENANT_ID);
    first.dismiss(STAFF_ID, 'no action', 'corr-list-1');
    await world.exceptionRepo.save(first);

    const open = await useCase.execute({ tenantId: TENANT_ID, status: 'OPEN' });
    const dismissed = await useCase.execute({ tenantId: TENANT_ID, status: 'DISMISSED' });
    const all = await useCase.execute({ tenantId: TENANT_ID });

    expect(open.items).toHaveLength(1);
    expect(dismissed.items.map((i) => i.id)).toEqual([first.id]);
    expect(all.items).toHaveLength(2);
  });

  it('returns a null booking summary when the booking cannot be read, sorted last', async () => {
    const source = await world.addResource('Sala 1');
    const service = await world.addService();
    await world.addBooking({ service, resource: source, startsInHours: 24 });
    await raiseFor(source.id);
    const [existing] = await world.exceptionRepo.findByTenant(TENANT_ID);
    const dangling = new FutureCommitmentExceptionBuilder()
      .withTenantId(TENANT_ID)
      .withSourceId(source.id)
      .build();
    world.exceptionRepo.seed(dangling);

    const { items } = await useCase.execute({ tenantId: TENANT_ID });

    expect(items.map((i) => i.id)).toEqual([existing.id, dangling.id]);
    expect(items[1].booking).toBeNull();
  });

  describe('affectedBookingId (M23-S46 — the booking detail’s decision panel)', () => {
    it('returns only that booking’s OPEN entries, one per deactivated resource, with their alternatives', async () => {
      const room = await world.addResource('Sala 1');
      const projector = await world.addResource('Projetor 1');
      const spareRoom = await world.addResource('Sala 2');
      const service = await world.addService();
      const bundle = await world.addBooking({
        service,
        resource: room,
        alsoHeld: [projector],
        startsInHours: 24,
      });
      const elsewhere = await world.addResource('Sala 3');
      const other = await world.addBooking({ service, resource: elsewhere, startsInHours: 48 });
      await raiseFor(room.id);
      await raiseFor(projector.id);
      await raiseFor(elsewhere.id);

      const { items } = await useCase.execute({
        tenantId: TENANT_ID,
        status: 'OPEN',
        affectedBookingId: bundle.id,
      });

      expect(items.map((i) => i.affectedId)).toEqual([bundle.id, bundle.id]);
      expect(items.map((i) => i.sourceId).sort()).toEqual([room.id, projector.id].sort());
      const roomEntry = items.find((i) => i.sourceId === room.id)!;
      expect(roomEntry.alternatives).toContainEqual({
        resourceId: spareRoom.id,
        resourceName: 'Sala 2',
      });
      expect(items.some((i) => i.affectedId === other.id)).toBe(false);
    });

    it('returns an empty list for an unmarked booking and for another tenant’s caller', async () => {
      const source = await world.addResource('Sala 1');
      const untouched = await world.addResource('Sala 2');
      const service = await world.addService();
      const marked = await world.addBooking({ service, resource: source, startsInHours: 24 });
      const plain = await world.addBooking({ service, resource: untouched, startsInHours: 48 });
      await raiseFor(source.id);

      const unmarked = await useCase.execute({
        tenantId: TENANT_ID,
        status: 'OPEN',
        affectedBookingId: plain.id,
      });
      const otherTenant = await useCase.execute({
        tenantId: FCE_OTHER_TENANT_ID,
        status: 'OPEN',
        affectedBookingId: marked.id,
      });

      expect(unmarked.items).toEqual([]);
      expect(otherTenant.items).toEqual([]);
    });
  });

  it('never lists another tenant’s entries (tenant isolation)', async () => {
    const source = await world.addResource('Sala 1');
    const service = await world.addService();
    await world.addBooking({ service, resource: source });
    await raiseFor(source.id);

    const { items } = await useCase.execute({ tenantId: FCE_OTHER_TENANT_ID });

    expect(items).toEqual([]);
  });
});
