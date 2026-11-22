import { SelfHealJob } from '../../contexts/billing/application/jobs/self-heal.job';
import type { BillingProvisioningConfig } from '../../contexts/billing/application/ports/billing-provisioning-config.port';
import { CheckProviderHealthUseCase } from '../../contexts/billing/application/use-cases/check-provider-health.use-case';
import { CreateTrialSubscriptionUseCase } from '../../contexts/billing/application/use-cases/create-trial-subscription.use-case';
import { EvaluateSuspensionFreezeUseCase } from '../../contexts/billing/application/use-cases/evaluate-suspension-freeze.use-case';
import { ReleaseStaleSignupRegistrationsUseCase } from '../../contexts/billing/application/use-cases/release-stale-signup-registrations.use-case';
import { RepairMissingSubscriptionsStep } from '../../contexts/billing/application/jobs/repair-missing-subscriptions.helpers';
import { BillingProviderRegistry } from '../../contexts/billing/infrastructure/providers/billing-provider.registry';
import { InMemorySignupRegistrationRepository } from '../repositories/billing/in-memory-signup-registration.repository';
import { InMemoryInboxRepository } from './in-memory-inbox.repository';
import { createSweepHarness } from './billing-sweep-harness';

export { SWEEP_NOW } from './billing-sweep-harness';

/**
 * The in-memory wiring of self-heal (UC-140) on top of the sweep harness: the same fake provider
 * behind the real registry, repositories, fake clock and Platform double, with the real
 * `CreateTrialSubscriptionUseCase` (the repair calls it), the four step use cases and the job.
 */
export function createSelfHealHarness() {
  const base = createSweepHarness();
  const registry = new BillingProviderRegistry('local', base.provider);
  const registrations = new InMemorySignupRegistrationRepository();
  const inbox = new InMemoryInboxRepository();
  const provisioning: BillingProvisioningConfig = { appEnv: 'local', platformOwnerSlug: null };
  const createTrial = new CreateTrialSubscriptionUseCase(
    base.subscriptions,
    base.accounts,
    registrations,
    base.prices,
    inbox,
    base.txManager,
    provisioning,
  );
  const repair = new RepairMissingSubscriptionsStep(base.platform, base.subscriptions, createTrial);
  const release = new ReleaseStaleSignupRegistrationsUseCase(registrations);
  const checkHealth = new CheckProviderHealthUseCase(registry, base.health, base.providerEvents);
  const evaluateFreeze = new EvaluateSuspensionFreezeUseCase(base.health);
  const selfHeal = new SelfHealJob(
    base.subscriptions,
    base.clock,
    repair,
    release,
    checkHealth,
    evaluateFreeze,
  );
  return {
    ...base,
    registry,
    registrations,
    inbox,
    createTrial,
    repair,
    release,
    checkHealth,
    evaluateFreeze,
    selfHeal,
  };
}
