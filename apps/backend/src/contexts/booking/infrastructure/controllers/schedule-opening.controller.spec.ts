import { HttpException } from '@nestjs/common';
import { futureDate, nextWeekday, pastDate } from '../../../../test/utils/date-helpers';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryScheduleOpeningRepository } from '../../../../test/repositories/booking/in-memory-schedule-opening.repository';
import { ScheduleOpeningBuilder } from '../../../../test/builders/booking/schedule-opening.builder';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import { OpenScheduleUseCase } from '../../application/use-cases/open-schedule.use-case';
import { ListOpeningsUseCase } from '../../application/use-cases/list-openings.use-case';
import { RemoveScheduleOpeningUseCase } from '../../application/use-cases/remove-schedule-opening.use-case';
import { ScheduleOpeningController } from './schedule-opening.controller';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const ACTOR_ID = '00000000-0000-7000-8000-000000000002';

describe('ScheduleOpeningController', () => {
  let repo: InMemoryScheduleOpeningRepository;
  let controller: ScheduleOpeningController;

  beforeEach(() => {
    repo = new InMemoryScheduleOpeningRepository();
    const ctx = new RequestContextBuilder().withTenantId(TENANT_ID).withActorId(ACTOR_ID).build();
    const tx = new InMemoryTransactionManager();
    controller = new ScheduleOpeningController(
      new OpenScheduleUseCase(repo, tx, ctx),
      new RemoveScheduleOpeningUseCase(repo, tx, ctx),
      new ListOpeningsUseCase(repo, ctx),
    );
  });

  describe('create()', () => {
    it('returns 201 result for a normally-closed day', async () => {
      const date = nextWeekday(0); // Sunday — closed by default
      const result = await controller.create({ date, startTime: '09:00', endTime: '14:00' });

      expect(result.id).toBeDefined();
      expect(result.date).toBe(date);
      expect(result.startTime).toBe('09:00');
      expect(result.endTime).toBe('14:00');
    });

    it('maps OpeningDateInPastError to 422', async () => {
      const err = await controller
        .create({ date: pastDate(1), startTime: '09:00', endTime: '14:00' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('maps DayAlreadyOpenInSettingsError to 422', async () => {
      const err = await controller
        .create({ date: nextWeekday(1), startTime: '09:00', endTime: '14:00' }) // Monday — open by default
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(422);
    });

    it('maps ScheduleOpeningAlreadyExistsError to 409', async () => {
      const date = nextWeekday(0);
      await repo.save(new ScheduleOpeningBuilder().withTenantId(TENANT_ID).withDate(date).build());

      const err = await controller
        .create({ date, startTime: '09:00', endTime: '14:00' })
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
    });
  });

  describe('remove()', () => {
    it('deletes an opening and returns void', async () => {
      const opening = new ScheduleOpeningBuilder()
        .withTenantId(TENANT_ID)
        .withDate(futureDate(5))
        .build();
      await repo.save(opening);

      const result = await controller.remove(opening.id);
      expect(result).toBeUndefined();
    });

    it('maps ScheduleOpeningNotFoundError to 404', async () => {
      const err = await controller
        .remove('00000000-0000-7000-8000-000000000099')
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(404);
    });
  });

  describe('list()', () => {
    it('returns items in the requested range', async () => {
      await repo.save(
        new ScheduleOpeningBuilder().withTenantId(TENANT_ID).withDate('2026-12-28').build(),
      );

      const result = await controller.list({ from: '2026-12-01', to: '2026-12-31' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].date).toBe('2026-12-28');
    });

    it('returns empty list when no openings in range', async () => {
      const result = await controller.list({ from: '2026-11-01', to: '2026-11-30' });
      expect(result.items).toHaveLength(0);
    });
  });
});
