import { futureDate } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryScheduleClosureRepository } from '../../../../test/repositories/booking/in-memory-schedule-closure.repository';
import { ScheduleClosureBuilder } from '../../../../test/builders/booking/index';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { ScheduleClosureNotFoundError } from '../../domain/errors/booking-domain.error';
import { RemoveClosureUseCase } from './remove-closure.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT = '99999999-0000-7000-8000-000000000099';
const ACTOR_ID = '00000000-0000-7000-8000-000000000002';

describe('RemoveClosureUseCase', () => {
  let repo: InMemoryScheduleClosureRepository;
  let useCase: RemoveClosureUseCase;

  beforeEach(() => {
    repo = new InMemoryScheduleClosureRepository();
    useCase = new RemoveClosureUseCase(
      repo,
      new InMemoryTransactionManager(),
      new RequestContextBuilder().withTenantId(TENANT_ID).withActorId(ACTOR_ID).build(),
    );
  });

  it('deletes an existing closure', async () => {
    const closure = new ScheduleClosureBuilder()
      .withTenantId(TENANT_ID)
      .withDate(futureDate(5))
      .build();
    await repo.save(closure);

    await useCase.execute(closure.id);

    expect(await repo.findById(closure.id, TENANT_ID)).toBeNull();
  });

  it('throws ScheduleClosureNotFoundError when closure does not exist', async () => {
    await expect(useCase.execute('00000000-0000-7000-8000-000000000099')).rejects.toThrow(
      ScheduleClosureNotFoundError,
    );
  });

  it('throws ScheduleClosureNotFoundError for a closure belonging to another tenant', async () => {
    const closure = new ScheduleClosureBuilder()
      .withTenantId(OTHER_TENANT)
      .withDate(futureDate(5))
      .build();
    await repo.save(closure);

    await expect(useCase.execute(closure.id)).rejects.toThrow(ScheduleClosureNotFoundError);
  });
});
