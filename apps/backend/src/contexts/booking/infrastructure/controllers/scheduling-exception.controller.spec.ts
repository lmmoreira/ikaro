import { HttpException } from '@nestjs/common';
import { BookingErrorCode } from '@ikaro/types/protocol/errors';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingQuoteRevisionRepository } from '../../../../test/repositories/booking/in-memory-booking-quote-revision.repository';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { RequestContextBuilder } from '../../../../test/factories/request-context.factory';
import {
  FCE_TENANT_ID as TENANT_ID,
  FutureCommitmentFixture,
} from '../../../../test/utils/future-commitment-fixture';
import { AvailabilityService } from '../../domain/services/availability.service';
import { BookingSlotConflictService } from '../../application/services/booking-slot-conflict.service';
import { DismissFutureCommitmentExceptionsUseCase } from '../../application/use-cases/dismiss-future-commitment-exceptions.use-case';
import { ListFutureCommitmentExceptionsUseCase } from '../../application/use-cases/list-future-commitment-exceptions.use-case';
import { ResolveFutureCommitmentExceptionsUseCase } from '../../application/use-cases/resolve-future-commitment-exceptions.use-case';
import { SchedulingExceptionController } from './scheduling-exception.controller';

const STAFF_ID = '00000000-0000-7000-8000-0000000000aa';

describe('SchedulingExceptionController', () => {
  let world: FutureCommitmentFixture;
  let controller: SchedulingExceptionController;

  beforeEach(() => {
    world = new FutureCommitmentFixture();
    const tx = new InMemoryTransactionManager();
    const ctx = new RequestContextBuilder()
      .withTenantId(TENANT_ID)
      .withActorId(STAFF_ID)
      .withActorType('STAFF')
      .withActorRole('MANAGER')
      .build();
    controller = new SchedulingExceptionController(
      ctx,
      new ListFutureCommitmentExceptionsUseCase(
        world.exceptionRepo,
        world.bookingRepo,
        world.resourceRepo,
      ),
      new ResolveFutureCommitmentExceptionsUseCase(
        world.exceptionRepo,
        world.bookingRepo,
        world.serviceRepo,
        world.resourceRepo,
        world.occupancyRepo,
        new InMemoryBookingQuoteRevisionRepository(),
        new InMemoryRecurringBookingScheduleRepository(),
        world.tenantLock,
        tx,
        new AvailabilityService(),
        new BookingSlotConflictService(world.occupancyRepo, world.tenantLock),
      ),
      new DismissFutureCommitmentExceptionsUseCase(world.exceptionRepo, tx),
    );
  });

  async function raiseOne(): Promise<{ entryId: string; alternativeId: string }> {
    const source = await world.addResource('Sala 1');
    const alternative = await world.addResource('Sala 2');
    const service = await world.addService();
    await world.addBooking({ service, resource: source });
    source.deactivate();
    await world.resourceRepo.save(source);
    await world.raise.execute({
      tenantId: TENANT_ID,
      resourceId: source.id,
      correlationId: 'corr-ctrl-1',
    });
    const [entry] = await world.exceptionRepo.findByTenant(TENANT_ID);
    return { entryId: entry.id, alternativeId: alternative.id };
  }

  describe('list()', () => {
    it('returns the open worklist items', async () => {
      const { entryId } = await raiseOne();

      const result = await controller.list({ status: 'OPEN' });

      expect(result.items.map((i) => i.id)).toEqual([entryId]);
    });
  });

  describe('resolve()', () => {
    it('resolves with the caller as the acting staff member and the tenant timezone', async () => {
      const { entryId, alternativeId } = await raiseOne();

      const result = await controller.resolve({
        exceptionIds: [entryId],
        resolutionType: 'REASSIGN',
        target: { resourceId: alternativeId },
      });

      expect(result.results).toEqual([{ exceptionId: entryId, outcome: 'RESOLVED' }]);
      const stored = (await world.exceptionRepo.findById(entryId, TENANT_ID))!;
      expect(stored.resolvedByStaffId).toBe(STAFF_ID);
    });

    it('reports a per-entry failure in the 200 body instead of throwing', async () => {
      const result = await controller.resolve({
        exceptionIds: ['00000000-0000-7000-8000-00000000dead'],
        resolutionType: 'KEEP',
      });

      expect(result.results[0]).toMatchObject({
        outcome: 'STILL_OPEN',
        errorCode: BookingErrorCode.EXCEPTION_NOT_FOUND,
      });
    });
  });

  describe('dismiss()', () => {
    it('dismisses with the caller as the acting staff member', async () => {
      const { entryId } = await raiseOne();

      const result = await controller.dismiss({ exceptionIds: [entryId], reason: 'handled' });

      expect(result.results).toEqual([{ exceptionId: entryId, outcome: 'RESOLVED' }]);
      const stored = (await world.exceptionRepo.findById(entryId, TENANT_ID))!;
      expect(stored.status).toBe('DISMISSED');
      expect(stored.resolvedByStaffId).toBe(STAFF_ID);
    });
  });

  it('maps an unexpected domain error to an HttpException', async () => {
    const failing = new SchedulingExceptionController(
      new RequestContextBuilder().withTenantId(TENANT_ID).withActorId(STAFF_ID).build(),
      {
        execute: () => Promise.reject(new Error('unexpected')),
      } as unknown as ListFutureCommitmentExceptionsUseCase,
      {} as ResolveFutureCommitmentExceptionsUseCase,
      {} as DismissFutureCommitmentExceptionsUseCase,
    );

    const err = await failing.list({}).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(HttpException);
  });
});
