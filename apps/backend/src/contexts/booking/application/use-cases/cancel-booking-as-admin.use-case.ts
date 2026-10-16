import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import { BookingNotFoundError } from '../../domain/errors/booking-domain.error';
import { IBookingRepository, BOOKING_REPOSITORY } from '../ports/booking-repository.port';
import {
  IResourceOccupancyRepository,
  RESOURCE_OCCUPANCY_REPOSITORY,
} from '../ports/resource-occupancy-repository.port';
import {
  FUTURE_COMMITMENT_EXCEPTION_REPOSITORY,
  IFutureCommitmentExceptionRepository,
} from '../ports/future-commitment-exception-repository.port';
import { ITenantLockPort, TENANT_LOCK_PORT } from '../ports/tenant-lock.port';
import { CancelBookingAsAdminDto } from '../dtos/cancel-booking-as-admin.dto';
import {
  saveTerminalBookingsInTransaction,
  TerminalBookingDeps,
} from './booking-exception-closing.helpers';

export type CancelBookingAsAdminUseCaseInput = CancelBookingAsAdminDto & {
  bookingId: string;
  tenantId: string;
  staffId: string;
  actorRole: 'STAFF' | 'MANAGER';
  correlationId: string;
};

export interface CancelBookingAsAdminUseCaseResult {
  bookingId: string;
  status: string;
}

@Injectable()
export class CancelBookingAsAdminUseCase {
  constructor(
    @Inject(BOOKING_REPOSITORY) private readonly bookingRepo: IBookingRepository,
    @Inject(RESOURCE_OCCUPANCY_REPOSITORY)
    private readonly occupancyRepo: IResourceOccupancyRepository,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(FUTURE_COMMITMENT_EXCEPTION_REPOSITORY)
    private readonly exceptionRepo: IFutureCommitmentExceptionRepository,
    @Inject(TENANT_LOCK_PORT) private readonly tenantLock: ITenantLockPort,
  ) {}

  private get closingDeps(): TerminalBookingDeps {
    return {
      bookingRepo: this.bookingRepo,
      occupancyRepo: this.occupancyRepo,
      exceptionRepo: this.exceptionRepo,
      tenantLock: this.tenantLock,
    };
  }

  async execute(
    input: CancelBookingAsAdminUseCaseInput,
  ): Promise<CancelBookingAsAdminUseCaseResult> {
    const { tenantId, staffId, correlationId } = input;

    const booking = await this.bookingRepo.findById(input.bookingId, tenantId);
    if (!booking) throw new BookingNotFoundError(input.bookingId);

    booking.cancel({ type: input.actorRole, id: staffId }, correlationId, input.reason);

    await this.txManager.run(async () => {
      await saveTerminalBookingsInTransaction(this.closingDeps, {
        tenantId,
        bookings: [booking],
        correlationId,
      });
    });

    return { bookingId: booking.id, status: booking.status };
  }
}
