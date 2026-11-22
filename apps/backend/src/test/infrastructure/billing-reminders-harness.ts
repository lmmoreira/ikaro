import { PublishBillingRemindersJob } from '../../contexts/billing/application/jobs/publish-billing-reminders.job';
import { PublishSubscriptionRemindersUseCase } from '../../contexts/billing/application/use-cases/publish-subscription-reminders.use-case';
import type { Charge } from '../../contexts/billing/domain/charge.aggregate';
import { BillingReminderDue } from '../../contexts/billing/domain/commands/billing-reminder-due.command';
import type { Subscription } from '../../contexts/billing/domain/subscription.aggregate';
import { BillingAccountBuilder, ChargeBuilder, ProviderHealthBuilder } from '../builders/billing';
import { InMemoryBillingAccountRepository } from '../repositories/billing/in-memory-billing-account.repository';
import { InMemoryChargeRepository } from '../repositories/billing/in-memory-charge.repository';
import { InMemoryProviderHealthRepository } from '../repositories/billing/in-memory-provider-health.repository';
import { InMemorySubscriptionRepository } from '../repositories/billing/in-memory-subscription.repository';
import { AdvanceableClock } from './advanceable-clock';
import { InMemoryOutboxPublisher } from './in-memory-outbox-publisher';
import { InMemoryTransactionManager } from './in-memory-transaction-manager';

// 11:00 UTC is 08:00 in São Paulo (UTC-3, no DST): the hour the daily trigger fires, on 2026-12-10.
export const REMINDERS_NOW = new Date('2026-12-10T11:00:00Z');
export const REMINDERS_TODAY = '2026-12-10';

/** The first instant of a São Paulo calendar day (a trial ends at that local midnight). */
export const saoPauloMidnight = (date: string): Date => new Date(`${date}T03:00:00Z`);

export interface SeedReminderChargeOptions {
  dueDate: string;
  kind?: 'PERIOD' | 'RECOVERY';
  status?: 'PENDING' | 'OVERDUE';
  /** `false` leaves the charge without a payment link (its provider creation is still `PENDING`). */
  ready?: boolean;
}

/**
 * The in-memory wiring of the dunning reminders (UC-139): in-memory repositories, an outbox that
 * records what a committed transaction wrote, and the real use case and job on top of an advanceable
 * clock. `seedTenant` stores a subscription with a billing account; `seedCharge` stores an open
 * charge, by default with a payment link. `commands()` reads back what the outbox recorded.
 */
export function createRemindersHarness() {
  const clock = new AdvanceableClock(REMINDERS_NOW);
  const txManager = new InMemoryTransactionManager();
  const outbox = new InMemoryOutboxPublisher(txManager);
  const subscriptions = new InMemorySubscriptionRepository(outbox);
  const accounts = new InMemoryBillingAccountRepository();
  const charges = new InMemoryChargeRepository(outbox);
  const health = new InMemoryProviderHealthRepository();
  const publishOne = new PublishSubscriptionRemindersUseCase(
    subscriptions,
    charges,
    accounts,
    outbox,
    txManager,
    clock,
  );
  const job = new PublishBillingRemindersJob(subscriptions, charges, health, clock, publishOne);

  async function seedTenant(
    subscription: Subscription,
    options: { billingEmail?: string | null } = {},
  ): Promise<void> {
    await subscriptions.save(subscription);
    const account = new BillingAccountBuilder().withTenantId(subscription.tenantId);
    if (options.billingEmail !== undefined) account.withBillingEmail(options.billingEmail);
    await accounts.save(account.build());
  }

  async function seedCharge(
    subscription: Subscription,
    options: SeedReminderChargeOptions,
  ): Promise<Charge> {
    const builder = new ChargeBuilder()
      .withTenantId(subscription.tenantId)
      .withSubscriptionId(subscription.id)
      .withDueDate(options.dueDate);
    if (options.kind === 'RECOVERY') builder.asRecovery();
    if (options.status === 'OVERDUE') builder.withStatus('OVERDUE');
    if (options.ready !== false) {
      builder.withProviderReady(
        'ASAAS',
        `provider-${subscription.id.slice(-6)}-${options.dueDate}`,
        `https://pay.example/${subscription.id.slice(-6)}`,
      );
    }
    const charge = builder.build();
    await charges.save(charge);
    return charge;
  }

  async function freeze(merchantProfileKey: string): Promise<void> {
    await health.save(
      new ProviderHealthBuilder()
        .withMerchantProfileKey(merchantProfileKey)
        .withFreeze(new Date('2026-12-09T00:00:00Z'))
        .build(),
    );
  }

  /** The reminder commands written so far, in order, optionally for one tenant. */
  const commands = (tenantId?: string): BillingReminderDue[] =>
    outbox.published.filter(
      (envelope): envelope is BillingReminderDue =>
        envelope instanceof BillingReminderDue &&
        (tenantId === undefined || envelope.tenantId === tenantId),
    );

  /** The compact view the specs assert on: `kind:daysOffset`. */
  const kinds = (tenantId?: string): string[] =>
    commands(tenantId).map((command) => `${command.data.kind}:${command.data.daysOffset}`);

  return {
    clock,
    txManager,
    outbox,
    subscriptions,
    accounts,
    charges,
    health,
    publishOne,
    job,
    seedTenant,
    seedCharge,
    freeze,
    commands,
    kinds,
  };
}
