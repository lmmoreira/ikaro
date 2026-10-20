import {
  FCE_OTHER_TENANT_ID,
  FCE_TENANT_ID as TENANT_ID,
  FutureCommitmentFixture,
} from '../../../../test/utils/future-commitment-fixture';
import { CountFutureCommitmentExceptionsUseCase } from './count-future-commitment-exceptions.use-case';

const STAFF_ID = '00000000-0000-7000-8000-0000000000aa';

describe('CountFutureCommitmentExceptionsUseCase', () => {
  let world: FutureCommitmentFixture;
  let useCase: CountFutureCommitmentExceptionsUseCase;

  beforeEach(() => {
    world = new FutureCommitmentFixture();
    useCase = new CountFutureCommitmentExceptionsUseCase(world.exceptionRepo);
  });

  async function raiseTwo(): Promise<void> {
    const source = await world.addResource('Sala 1');
    const service = await world.addService();
    await world.addBooking({ service, resource: source, startsInHours: 24 });
    await world.addBooking({ service, resource: source, startsInHours: 48 });
    await world.raise.raiseForResource({
      tenantId: TENANT_ID,
      resourceId: source.id,
      correlationId: 'corr-count-1',
    });
  }

  it('returns 0 when nothing waits for a decision', async () => {
    await expect(useCase.execute({ tenantId: TENANT_ID })).resolves.toEqual({ count: 0 });
  });

  it('counts the open entries', async () => {
    await raiseTwo();

    await expect(useCase.execute({ tenantId: TENANT_ID })).resolves.toEqual({ count: 2 });
  });

  it('does not count a resolved or dismissed entry (only OPEN waits for a decision)', async () => {
    await raiseTwo();
    const [first, second] = await world.exceptionRepo.findByTenant(TENANT_ID);
    first.dismiss(STAFF_ID, 'handled', 'corr-count-1');
    await world.exceptionRepo.save(first);
    second.resolve(STAFF_ID, 'KEEP', null, 'corr-count-1');
    await world.exceptionRepo.save(second);

    await expect(useCase.execute({ tenantId: TENANT_ID })).resolves.toEqual({ count: 0 });
  });

  it('never counts another tenant’s entries (tenant isolation)', async () => {
    await raiseTwo();

    await expect(useCase.execute({ tenantId: FCE_OTHER_TENANT_ID })).resolves.toEqual({
      count: 0,
    });
  });
});
