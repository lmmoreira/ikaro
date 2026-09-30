import { FutureCommitmentExceptionBuilder } from '../../../../test/builders/booking/index';
import {
  FCE_OTHER_TENANT_ID,
  FCE_TENANT_ID as TENANT_ID,
  FutureCommitmentFixture,
} from '../../../../test/utils/future-commitment-fixture';
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
    });
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

  it('never lists another tenant’s entries (tenant isolation)', async () => {
    const source = await world.addResource('Sala 1');
    const service = await world.addService();
    await world.addBooking({ service, resource: source });
    await raiseFor(source.id);

    const { items } = await useCase.execute({ tenantId: FCE_OTHER_TENANT_ID });

    expect(items).toEqual([]);
  });
});
