import type { AppLogger } from '../../../../shared/observability/app-logger';

/** What this step needs of the creation service: a helper imports no service, so the shape is its own. */
export interface RecoveryChargeCreator {
  execute(command: { tenantId: string; chargeId: string; correlationId: string }): Promise<unknown>;
}

/**
 * After commit, outside any transaction: a reversal (a refund or a chargeback) suspended the
 * tenant and inserted its `RECOVERY` charge `PENDING`; this makes it payable now, so the manager
 * lands on a payment link. It never fails the caller (the fact is already applied and, for the
 * webhook, acknowledged): a charge left `PENDING` is picked up by S05's creation retry. The one step
 * behind the webhook's and reconcile's reversal paths.
 */
export async function createRecoveryChargeAtProvider(
  creation: RecoveryChargeCreator,
  logger: AppLogger,
  command: { tenantId: string; chargeId: string; correlationId: string },
): Promise<void> {
  try {
    await creation.execute(command);
  } catch (err) {
    logger.error(
      'billing_recovery_creation_failed: left for the retry',
      err instanceof Error ? err.stack : String(err),
      { tenantId: command.tenantId, chargeId: command.chargeId },
    );
  }
}
