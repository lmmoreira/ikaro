import { Injectable } from '@nestjs/common';
import {
  ChargeProviderSyncService,
  type ChargeSyncResult,
} from '../services/charge-provider-sync.service';

export interface ReconcileOneChargeUseCaseInput {
  tenantId: string;
  chargeId: string;
  correlationId: string;
}

export type ReconcileOneChargeUseCaseResult = ChargeSyncResult;

/**
 * UC-116, one charge of a reconcile run: read the provider and apply the difference through the
 * shared service. The job that selects the charges calls this once per charge, so one charge's
 * failure (a provider error, a lost race) is the job's to count and never stops the others.
 */
@Injectable()
export class ReconcileOneChargeUseCase {
  constructor(private readonly sync: ChargeProviderSyncService) {}

  execute(input: ReconcileOneChargeUseCaseInput): Promise<ReconcileOneChargeUseCaseResult> {
    return this.sync.sync(input);
  }
}
