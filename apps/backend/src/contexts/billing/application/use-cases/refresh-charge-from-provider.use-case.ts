import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../../../shared/observability/app-logger';
import type { Charge } from '../../domain/charge.aggregate';
import { CHARGE_REPOSITORY, IChargeRepository } from '../ports/charge-repository.port';
import { ChargeProviderSyncService } from '../services/charge-provider-sync.service';

export interface RefreshChargeFromProviderUseCaseInput {
  tenantId: string;
  chargeId: string;
  correlationId: string;
}

/**
 * UC-116's on-demand path, one charge of one tenant: the payment page's return calls this so the
 * manager sees the new state on the next poll without waiting for the webhook (UC-119). One
 * provider read and one apply through the shared service, then the charge as it now is, or `null`
 * when the tenant has no such charge (another tenant's id is "not found", never a read of it). It
 * never throws on a provider error: the read failed, the charge is returned unchanged and the page
 * keeps polling.
 */
@Injectable()
export class RefreshChargeFromProviderUseCase {
  private readonly logger = new AppLogger(RefreshChargeFromProviderUseCase.name);

  constructor(
    private readonly sync: ChargeProviderSyncService,
    @Inject(CHARGE_REPOSITORY) private readonly charges: IChargeRepository,
  ) {}

  async execute(input: RefreshChargeFromProviderUseCaseInput): Promise<Charge | null> {
    const charge = await this.charges.findById(input.tenantId, input.chargeId);
    if (charge === null) return null;
    try {
      await this.sync.sync(input);
    } catch (err) {
      this.logger.warn('billing_refresh_failed: the charge is returned unchanged', {
        tenantId: input.tenantId,
        chargeId: input.chargeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return this.charges.findById(input.tenantId, input.chargeId);
  }
}
