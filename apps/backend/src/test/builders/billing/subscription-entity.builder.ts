import { SubscriptionEntity } from '../../../contexts/billing/infrastructure/entities/subscription.entity';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

const DAY_MS = 24 * 60 * 60 * 1000;

export class SubscriptionEntityBuilder {
  private id = uuidv7();
  private tenantId = uuidv7();
  private status = 'TRIALING';
  private suspensionReason: string | null = null;
  private countryCode = 'BR';
  private currency = 'BRL';
  private readonly timezone = 'America/Sao_Paulo';
  private readonly merchantProfileKey = 'BRL_FAKE';
  private readonly anchorDay = 15;
  private trialEndsAt: Date | null = new Date(Date.now() + 7 * DAY_MS);
  private currentPeriodStart: Date | null = null;
  private currentPeriodEnd: Date | null = null;
  private nextDueDate: string | null = null;
  private pastDueSince: Date | null = null;
  private graceUntil: Date | null = null;
  private cancelAt: Date | null = null;
  private planConfirmedAt: Date | null = null;
  private suspendedAt: Date | null = null;
  private purgeWarning30SentAt: Date | null = null;
  private purgeWarning7SentAt: Date | null = null;
  private hasEverPaid = false;
  private exempt = false;
  private version = 0;

  withId(id: string): this {
    this.id = id;
    return this;
  }

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withStatus(status: string): this {
    this.status = status;
    return this;
  }

  withSuspension(reason: string, suspendedAt: Date): this {
    this.status = 'SUSPENDED';
    this.suspensionReason = reason;
    this.suspendedAt = suspendedAt;
    return this;
  }

  withCountryCode(countryCode: string): this {
    this.countryCode = countryCode;
    return this;
  }

  withCurrency(currency: string): this {
    this.currency = currency;
    return this;
  }

  withTrialEndsAt(trialEndsAt: Date | null): this {
    this.trialEndsAt = trialEndsAt;
    return this;
  }

  withNextDueDate(nextDueDate: string | null): this {
    this.nextDueDate = nextDueDate;
    return this;
  }

  withPastDueSince(pastDueSince: Date | null): this {
    this.pastDueSince = pastDueSince;
    return this;
  }

  withHasEverPaid(hasEverPaid: boolean): this {
    this.hasEverPaid = hasEverPaid;
    return this;
  }

  withExempt(exempt: boolean): this {
    this.exempt = exempt;
    return this;
  }

  withVersion(version: number): this {
    this.version = version;
    return this;
  }

  build(): SubscriptionEntity {
    const e = new SubscriptionEntity();
    e.id = this.id;
    e.tenantId = this.tenantId;
    e.status = this.status;
    e.suspensionReason = this.suspensionReason;
    e.countryCode = this.countryCode;
    e.currency = this.currency;
    e.timezone = this.timezone;
    e.merchantProfileKey = this.merchantProfileKey;
    e.cycle = 'MONTHLY';
    e.anchorDay = this.anchorDay;
    e.trialEndsAt = this.trialEndsAt;
    e.currentPeriodStart = this.currentPeriodStart;
    e.currentPeriodEnd = this.currentPeriodEnd;
    e.nextDueDate = this.nextDueDate;
    e.pastDueSince = this.pastDueSince;
    e.graceUntil = this.graceUntil;
    e.cancelAt = this.cancelAt;
    e.planConfirmedAt = this.planConfirmedAt;
    e.suspendedAt = this.suspendedAt;
    e.purgeWarning30SentAt = this.purgeWarning30SentAt;
    e.purgeWarning7SentAt = this.purgeWarning7SentAt;
    e.hasEverPaid = this.hasEverPaid;
    e.exempt = this.exempt;
    e.version = this.version;
    e.updatedAt = new Date();
    return e;
  }
}
