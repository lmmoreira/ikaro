import { drainDomainEvents } from '../../../shared/infrastructure/outbox/drain-domain-events';
import type { IOutboxPublisher } from '../../../shared/ports/outbox-publisher.port';
import {
  ChargeRef,
  IChargeRepository,
  ListChargesQuery,
} from '../../../contexts/billing/application/ports/charge-repository.port';
import type { BillingProvider } from '../../../contexts/billing/domain/billing-account.aggregate';
import { PROVIDER_CREATION_LEASE_MINUTES } from '../../../contexts/billing/domain/billing-constants';
import type { Charge } from '../../../contexts/billing/domain/charge.aggregate';
import { ChargeAlreadyExistsError } from '../../../contexts/billing/domain/errors/charge-already-exists.error';
import { RecoveryChargeAlreadyOpenError } from '../../../contexts/billing/domain/errors/recovery-charge-already-open.error';

interface Claim {
  attempts: number;
  lastAttemptAt: Date;
}

/**
 * The same observable behaviour as the TypeORM adapter for use-case specs: the two unique indexes
 * (a second period charge, a second open recovery charge) throw the same errors, and the creation
 * lease is tracked beside the aggregate. No row lock and no `version` check: concurrency is proved
 * against the real adapter in the integration specs.
 */
export class InMemoryChargeRepository implements IChargeRepository {
  readonly saved: Charge[] = [];

  constructor(private readonly outboxPublisher: IOutboxPublisher = { publish: async () => {} }) {}

  private readonly claims = new Map<string, Claim>();

  /** The attempts the claim has counted for a charge (the aggregate never changes them). */
  claimedAttempts(chargeId: string): number {
    const charge = this.saved.find((c) => c.id === chargeId);
    return (charge && this.leaseOf(charge)?.attempts) || 0;
  }

  async findById(tenantId: string, id: string): Promise<Charge | null> {
    return this.saved.find((c) => c.tenantId === tenantId && c.id === id) ?? null;
  }

  async findByIdForUpdate(tenantId: string, id: string): Promise<Charge | null> {
    return this.findById(tenantId, id);
  }

  async findByProviderChargeId(
    tenantId: string,
    provider: BillingProvider,
    providerChargeId: string,
  ): Promise<Charge | null> {
    return (
      this.saved.find(
        (c) =>
          c.tenantId === tenantId &&
          c.provider === provider &&
          c.providerChargeId === providerChargeId,
      ) ?? null
    );
  }

  async findOpenByTenant(tenantId: string): Promise<Charge[]> {
    return this.saved
      .filter((c) => c.tenantId === tenantId && c.open)
      .sort((a, b) => a.dueDate.value.localeCompare(b.dueDate.value) || a.id.localeCompare(b.id));
  }

  async findOpenRecoveryBySubscription(
    tenantId: string,
    subscriptionId: string,
  ): Promise<Charge | null> {
    return (
      this.saved.find(
        (c) =>
          c.tenantId === tenantId &&
          c.subscriptionId === subscriptionId &&
          c.kind === 'RECOVERY' &&
          c.open,
      ) ?? null
    );
  }

  async listByTenantPage(
    tenantId: string,
    query: ListChargesQuery,
  ): Promise<{ items: Charge[]; total: number }> {
    const all = this.saved
      .filter((c) => c.tenantId === tenantId)
      .sort((a, b) => b.dueDate.value.localeCompare(a.dueDate.value) || b.id.localeCompare(a.id));
    return { items: all.slice(query.offset, query.offset + query.limit), total: all.length };
  }

  async save(charge: Charge): Promise<void> {
    if (!this.saved.includes(charge)) {
      this.assertUnique(charge);
      this.saved.push(charge);
    }
    await drainDomainEvents(charge, this.outboxPublisher);
  }

  async findByIdForJob(id: string): Promise<Charge | null> {
    return this.saved.find((c) => c.id === id) ?? null;
  }

  async claimForProviderCreation(tenantId: string, chargeId: string, now: Date): Promise<boolean> {
    const charge = await this.findById(tenantId, chargeId);
    if (!charge?.open || !this.awaitingCreation(charge)) return false;
    const claim = this.leaseOf(charge);
    if (claim && !this.leaseFree(claim, now)) return false;
    this.claims.set(chargeId, { attempts: (claim?.attempts ?? 0) + 1, lastAttemptAt: now });
    return true;
  }

  // In charge-id order, one page after `afterId`, like the production query.
  async listPendingCreationForJob(
    now: Date,
    limit: number,
    afterId?: string,
  ): Promise<ChargeRef[]> {
    return this.saved
      .filter((c) => {
        const claim = this.leaseOf(c);
        return (
          c.open &&
          this.awaitingCreation(c) &&
          (!claim || this.leaseFree(claim, now)) &&
          (afterId === undefined || c.id > afterId)
        );
      })
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((c) => ({ tenantId: c.tenantId, id: c.id }));
  }

  async listOpenDueForJob(dueOnOrBefore: string, limit: number): Promise<ChargeRef[]> {
    return this.refs(
      this.saved.filter((c) => c.open && c.dueDate.value <= dueOnOrBefore),
      limit,
    );
  }

  async listOpenForJob(limit: number): Promise<ChargeRef[]> {
    return this.refs(
      this.saved.filter((c) => c.open),
      limit,
    );
  }

  async listProviderCancelPendingForJob(limit: number): Promise<ChargeRef[]> {
    return this.refs(
      this.saved.filter((c) => c.providerCancelPending),
      limit,
    );
  }

  private awaitingCreation(charge: Charge): boolean {
    return charge.providerCreationStatus === 'PENDING' && charge.providerChargeId === null;
  }

  // The lease state: what the repository's claims recorded, else what the charge was loaded with
  // (a charge never attempted has no lease at all).
  private leaseOf(charge: Charge): Claim | null {
    const claim = this.claims.get(charge.id);
    if (claim) return claim;
    return charge.providerCreationLastAttemptAt
      ? {
          attempts: charge.providerCreationAttempts,
          lastAttemptAt: charge.providerCreationLastAttemptAt,
        }
      : null;
  }

  private leaseFree(claim: Claim, now: Date): boolean {
    return claim.lastAttemptAt.getTime() < now.getTime() - PROVIDER_CREATION_LEASE_MINUTES * 60_000;
  }

  private refs(charges: Charge[], limit: number): ChargeRef[] {
    return [...charges]
      .sort((a, b) => a.dueDate.value.localeCompare(b.dueDate.value) || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((c) => ({ tenantId: c.tenantId, id: c.id }));
  }

  // `UQ_billing_charges_period` ignores a cancelled charge; `UQ_billing_charges_open_recovery`
  // looks at open recovery charges only.
  private assertUnique(charge: Charge): void {
    if (
      charge.kind === 'PERIOD' &&
      charge.status !== 'CANCELED' &&
      this.saved.some(
        (c) =>
          c.tenantId === charge.tenantId &&
          c.subscriptionId === charge.subscriptionId &&
          c.kind === 'PERIOD' &&
          c.status !== 'CANCELED' &&
          c.periodStart?.value === charge.periodStart?.value,
      )
    ) {
      throw new ChargeAlreadyExistsError();
    }
    if (
      charge.kind === 'RECOVERY' &&
      charge.open &&
      this.saved.some(
        (c) =>
          c.tenantId === charge.tenantId &&
          c.subscriptionId === charge.subscriptionId &&
          c.kind === 'RECOVERY' &&
          c.open,
      )
    ) {
      throw new RecoveryChargeAlreadyOpenError();
    }
  }
}
