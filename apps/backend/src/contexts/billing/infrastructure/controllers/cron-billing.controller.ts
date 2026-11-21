import { Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { NoFeatureGate, SuspensionAccess } from '@ikaro/nestjs-http';
import { ITriggerBus, TRIGGER_BUS } from '../../../../shared/ports/trigger-bus.port';
import {
  CRON_BILLING_ISSUE_CHARGES_TRIGGER,
  CRON_BILLING_RECONCILE_TRIGGER,
  CRON_BILLING_STATUS_SWEEP_TRIGGER,
} from '../events/cron-trigger-names.constants';

// Thin publisher (the local / manual path of the Billing crons, `docs/API_CONTRACTS.md` § Billing
// cron triggers): it publishes the trigger onto the channel Cloud Scheduler publishes to in prod,
// still behind the global InternalApiGuard. The job itself runs in the trigger handler, dispatched
// through the shared /pubsub/push receiver. The route is tenant-less and open to suspended tenants'
// charges (the retry reaches their recovery charge), hence the explicit annotations. Every later
// Billing job story adds its own route here.
@NoFeatureGate()
@SuspensionAccess('ANY_AUTHENTICATED')
@Controller('cron')
export class CronBillingController {
  constructor(@Inject(TRIGGER_BUS) private readonly triggerBus: ITriggerBus) {}

  @Post('billing-issue-charges')
  @HttpCode(HttpStatus.OK)
  async issueCharges(): Promise<{ ok: boolean }> {
    await this.triggerBus.publishTrigger(CRON_BILLING_ISSUE_CHARGES_TRIGGER);
    return { ok: true };
  }

  @Post('billing-status-sweep')
  @HttpCode(HttpStatus.OK)
  async statusSweep(): Promise<{ ok: boolean }> {
    await this.triggerBus.publishTrigger(CRON_BILLING_STATUS_SWEEP_TRIGGER);
    return { ok: true };
  }

  @Post('billing-reconcile')
  @HttpCode(HttpStatus.OK)
  async reconcile(): Promise<{ ok: boolean }> {
    await this.triggerBus.publishTrigger(CRON_BILLING_RECONCILE_TRIGGER);
    return { ok: true };
  }
}
