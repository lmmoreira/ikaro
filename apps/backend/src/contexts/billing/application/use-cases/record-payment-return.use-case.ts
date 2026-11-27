import { Inject, Injectable } from '@nestjs/common';
import type { BillingPaymentReturnResponse } from '@ikaro/types';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { CLOCK, type IClock } from '../../../../shared/ports/clock.port';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import type { Charge } from '../../domain/charge.aggregate';
import { ChargeNotFoundError } from '../../domain/errors/billing-domain.error';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import { ChargeProviderSyncService } from '../services/charge-provider-sync.service';

export interface RecordPaymentReturnUseCaseInput {
  tenantId: string;
  chargeId: string;
  correlationId: string;
}

export type RecordPaymentReturnUseCaseResult = BillingPaymentReturnResponse;

/**
 * UC-119 / UC-116: the manager is back from the hosted payment page. For an open charge it records
 * `payment_return_seen_at` (once, idempotent: it lengthens the settlement margin of the status
 * sweep for a boleto that has not compensated yet), then asks the provider for the charge's state
 * through the shared sync service, so the page sees a payment without waiting for the webhook. A
 * charge that is not open (paid, cancelled, refunded) records and refreshes nothing; it just
 * answers its current state.
 *
 * The write is one short transaction under the charge row lock (B-C1, no B-R1: charge columns only)
 * on a fresh read. The provider read runs after it, outside any transaction, and **never fails the
 * request**: a provider that is down or has no adapter yet leaves the state unchanged and the page
 * keeps polling the summary (A2). A paid fact is applied by `ApplyChargeFactService` through the
 * sync, exactly as the webhook does.
 */
@Injectable()
export class RecordPaymentReturnUseCase {
  private readonly logger = new AppLogger(RecordPaymentReturnUseCase.name);

  constructor(
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
    private readonly sync: ChargeProviderSyncService,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
    @Inject(CLOCK) private readonly clock: IClock,
  ) {}

  async execute(input: RecordPaymentReturnUseCaseInput): Promise<RecordPaymentReturnUseCaseResult> {
    const charge = await this.charges.findById(input.tenantId, input.chargeId);
    if (charge === null) throw new ChargeNotFoundError(input.chargeId);
    if (!charge.open) return toResponse(charge);

    // A charge a webhook settled between the read and the lock is not open any more: there is
    // nothing to record and nothing to ask the provider.
    if (await this.record(input)) await this.refresh(input);
    const current = await this.charges.findById(input.tenantId, input.chargeId);
    if (current === null) throw new ChargeNotFoundError(input.chargeId);
    return toResponse(current);
  }

  // Set once: a second return writes nothing. Answers whether the charge was still open under the
  // lock, which is what the refresh that follows depends on.
  private async record(input: RecordPaymentReturnUseCaseInput): Promise<boolean> {
    return this.txManager.run(async () => {
      const locked = await this.charges.findByIdForUpdate(input.tenantId, input.chargeId);
      if (locked === null || !locked.open) return false;
      if (locked.paymentReturnSeenAt === null) {
        locked.recordPaymentReturn(this.clock.now());
        await this.charges.save(locked);
      }
      return true;
    });
  }

  private async refresh(input: RecordPaymentReturnUseCaseInput): Promise<void> {
    try {
      await this.sync.sync(input);
    } catch (err) {
      this.logger.warn('billing_refresh_failed: the charge is returned unchanged', {
        tenantId: input.tenantId,
        chargeId: input.chargeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function toResponse(charge: Charge): BillingPaymentReturnResponse {
  return {
    status: charge.status,
    paymentConfirmationPending: charge.paymentConfirmationPending,
  };
}
