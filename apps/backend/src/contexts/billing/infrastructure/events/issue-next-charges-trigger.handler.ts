import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { AppLogger } from '../../../../shared/observability/app-logger';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import { IssueNextChargesJob } from '../../application/jobs/issue-next-charges.job';
import { CRON_BILLING_ISSUE_CHARGES_TRIGGER } from './cron-trigger-names.constants';

/**
 * The daily `cron-billing-issue-charges` trigger (UC-113): calls exactly one job and rethrows,
 * so a failed run is nacked and redelivered. The trigger carries no tenant, so a fresh correlation
 * id is minted for the run and passed down.
 */
@Injectable()
export class IssueNextChargesTriggerHandler implements OnModuleInit {
  static readonly CONSUMER_NAME = 'billing-issue-next-charges';

  private readonly logger = new AppLogger(IssueNextChargesTriggerHandler.name);

  constructor(
    @Inject(IssueNextChargesJob)
    private readonly issueNextCharges: Pick<IssueNextChargesJob, 'run'>,
    @Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus,
  ) {}

  onModuleInit(): void {
    this.triggerBus.registerTrigger(
      CRON_BILLING_ISSUE_CHARGES_TRIGGER,
      () => this.handle(),
      IssueNextChargesTriggerHandler.CONSUMER_NAME,
    );
  }

  async handle(): Promise<void> {
    const correlationId = uuidv7();
    this.logger.log(`${CRON_BILLING_ISSUE_CHARGES_TRIGGER} trigger received`, { correlationId });
    try {
      await this.issueNextCharges.run({ correlationId });
    } catch (err) {
      this.logger.error(
        'IssueNextChargesTriggerHandler failed, will nack for retry',
        err instanceof Error ? err.stack : String(err),
        { correlationId },
      );
      throw err;
    }
  }
}
