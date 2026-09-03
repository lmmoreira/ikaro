import { futureDate } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/index';
import { RemoveScheduleOpeningUseCase } from './remove-schedule-opening.use-case';
import {
  ScheduleOpeningNotFoundError,
  TenantOpeningHasResourceDependentsError,
} from '../../domain/errors/booking-domain.error';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-7000-8000-000000000099';

describe('RemoveScheduleOpeningUseCase', () => {
  let repo: InMemoryScheduleOpeningRepository;
  let useCase: RemoveScheduleOpeningUseCase;

  beforeEach(() => {
    repo = new InMemoryScheduleOpeningRepository();
    const tx = new InMemoryTransactionManager();
    useCase = new RemoveScheduleOpeningUseCase(repo, tx);
  });

  it('deletes an existing opening', async () => {
    const opening = new ScheduleOpeningBuilder()
      .withTenantId(TENANT_ID)
      .withDate(futureDate(5))
      .build();
    await repo.save(opening);

    await useCase.execute({ id: opening.id, tenantId: TENANT_ID });

    const stored = await repo.findById(opening.id, TENANT_ID);
    expect(stored).toBeNull();
  });

  it('throws ScheduleOpeningNotFoundError for unknown id', async () => {
    await expect(
      useCase.execute({ id: '00000000-0000-7000-8000-000000000099', tenantId: TENANT_ID }),
    ).rejects.toThrow(ScheduleOpeningNotFoundError);
  });

  it('throws ScheduleOpeningNotFoundError for opening belonging to another tenant', async () => {
    const opening = new ScheduleOpeningBuilder()
      .withTenantId(OTHER_TENANT_ID)
      .withDate(futureDate(5))
      .build();
    await repo.save(opening);

    await expect(useCase.execute({ id: opening.id, tenantId: TENANT_ID })).rejects.toThrow(
      ScheduleOpeningNotFoundError,
    );
  });

  describe('tenant-opening deletion cascade (M21 Cluster 1, Codex PR #460 round-4 finding)', () => {
    const RESOURCE_ID = '00000000-0000-7000-8000-000000000003';

    it('throws TenantOpeningHasResourceDependentsError when a resource-scoped opening depends on it', async () => {
      const date = futureDate(5);
      const tenantWide = new ScheduleOpeningBuilder()
        .withTenantId(TENANT_ID)
        .withDate(date)
        .build();
      await repo.save(tenantWide);
      await repo.save(
        new ScheduleOpeningBuilder()
          .withTenantId(TENANT_ID)
          .withResourceId(RESOURCE_ID)
          .withDate(date)
          .build(),
      );

      await expect(useCase.execute({ id: tenantWide.id, tenantId: TENANT_ID })).rejects.toThrow(
        TenantOpeningHasResourceDependentsError,
      );

      const stored = await repo.findById(tenantWide.id, TENANT_ID);
      expect(stored).not.toBeNull();
    });

    it('allows deleting a tenant-wide opening with no resource-scoped dependents', async () => {
      const date = futureDate(5);
      const tenantWide = new ScheduleOpeningBuilder()
        .withTenantId(TENANT_ID)
        .withDate(date)
        .build();
      await repo.save(tenantWide);

      await useCase.execute({ id: tenantWide.id, tenantId: TENANT_ID });

      const stored = await repo.findById(tenantWide.id, TENANT_ID);
      expect(stored).toBeNull();
    });

    it('never blocks deleting a resource-scoped opening directly', async () => {
      const date = futureDate(5);
      const scoped = new ScheduleOpeningBuilder()
        .withTenantId(TENANT_ID)
        .withResourceId(RESOURCE_ID)
        .withDate(date)
        .build();
      await repo.save(scoped);

      await useCase.execute({ id: scoped.id, tenantId: TENANT_ID });

      const stored = await repo.findById(scoped.id, TENANT_ID);
      expect(stored).toBeNull();
    });
  });
});
