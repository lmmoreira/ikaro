import { CHATBOT_TIERS, type ChatbotTier, type FeatureKey } from '@ikaro/validation';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { CalendarDate } from '../../../shared/value-objects/calendar-date.vo';
import { CountryCode } from '../../../shared/value-objects/country-code.vo';
import { FeaturePriceInvariantError } from './errors/billing-domain.error';
import { MinorAmount } from './value-objects/minor-amount.vo';

/** `CHATBOT` is sold as `BASIC` or `PLUS`; every other feature has the single tier `STANDARD`. */
export type FeatureTier = ChatbotTier | 'STANDARD';

/** v1 sells monthly only; annual billing (slice H) relaxes this by an expand migration. */
export type FeaturePriceCycle = 'MONTHLY';

export interface FeaturePriceVersion {
  readonly id: string;
  readonly amount: MinorAmount;
  // A service-period start date: an invoice snapshots this amount only when its period starts on
  // or after this date (docs/DOMAIN_MODEL.md § Aggregate: FeaturePrice).
  readonly effectiveFrom: CalendarDate;
  readonly announcedAt: Date | null;
  readonly createdBy: string;
  readonly reason: string;
  // Set when a newer pending version replaces this not-yet-effective one; the row is kept as history.
  readonly supersededAt: Date | null;
  readonly batchId: string | null;
}

export interface FeaturePriceProps {
  id: string;
  featureKey: FeatureKey;
  countryCode: CountryCode;
  tier: FeatureTier;
  cycle: FeaturePriceCycle;
  currency: string;
  // false hides the price from NEW selection; an existing subscriber keeps renewing it.
  selectable: boolean;
  versions: FeaturePriceVersion[];
}

export type NewFeaturePriceVersion = Omit<FeaturePriceVersion, 'supersededAt'>;

/**
 * Platform-wide price list entry (no `tenant_id` — the documented exemption, see
 * docs/TENANT_ISOLATION_STRATEGY.md): one row per feature × country × tier × cycle, with its
 * dated amounts as immutable versions. M25 builds the aggregate and its read side; the operator
 * write path (price changes, supersession, announcements) is M26's UC-112.
 */
export class FeaturePrice extends AggregateRoot {
  readonly id: string;
  readonly featureKey: FeatureKey;
  readonly countryCode: CountryCode;
  readonly tier: FeatureTier;
  readonly cycle: FeaturePriceCycle;
  readonly currency: string;
  readonly selectable: boolean;
  private _versions: FeaturePriceVersion[];

  private constructor(props: FeaturePriceProps) {
    super();
    this.id = props.id;
    this.featureKey = props.featureKey;
    this.countryCode = props.countryCode;
    this.tier = props.tier;
    this.cycle = props.cycle;
    this.currency = props.currency;
    this.selectable = props.selectable;
    this._versions = [...props.versions];
  }

  static create(props: Omit<FeaturePriceProps, 'versions'>): FeaturePrice {
    FeaturePrice.assertShape(props);
    return new FeaturePrice({ ...props, versions: [] });
  }

  static reconstitute(props: FeaturePriceProps): FeaturePrice {
    return new FeaturePrice(props);
  }

  get versions(): readonly FeaturePriceVersion[] {
    return [...this._versions];
  }

  /**
   * Appends a dated version. It must start strictly after the latest version that is still live:
   * a version in effect is immutable history, and `(price, effective_from)` is unique among the
   * non-superseded ones. Superseding a pending version is M26's write path, not this method.
   */
  addVersion(version: NewFeaturePriceVersion): void {
    if (version.amount.currency !== this.currency) {
      throw new FeaturePriceInvariantError(
        `version currency ${version.amount.currency} does not match the price currency ${this.currency}`,
      );
    }
    const latest = this.latestLiveVersion();
    if (latest && !latest.effectiveFrom.isBefore(version.effectiveFrom)) {
      throw new FeaturePriceInvariantError(
        `version effectiveFrom ${version.effectiveFrom.value} must be later than the latest version's ${latest.effectiveFrom.value}`,
      );
    }
    this._versions.push({ ...version, supersededAt: null });
  }

  /**
   * The version whose `effectiveFrom` is the latest one not after `date`, ignoring superseded
   * versions; null when none has started yet. Deliberately ignores `selectable`: a hidden price
   * still renews for the subscribers who already have it.
   */
  versionInForceAt(date: CalendarDate): FeaturePriceVersion | null {
    let inForce: FeaturePriceVersion | null = null;
    for (const version of this._versions) {
      if (version.supersededAt !== null) continue;
      if (date.isBefore(version.effectiveFrom)) continue;
      if (inForce === null || inForce.effectiveFrom.isBefore(version.effectiveFrom)) {
        inForce = version;
      }
    }
    return inForce;
  }

  private latestLiveVersion(): FeaturePriceVersion | null {
    let latest: FeaturePriceVersion | null = null;
    for (const version of this._versions) {
      if (version.supersededAt !== null) continue;
      if (latest === null || latest.effectiveFrom.isBefore(version.effectiveFrom)) {
        latest = version;
      }
    }
    return latest;
  }

  private static assertShape(props: Omit<FeaturePriceProps, 'versions'>): void {
    const validTiers: readonly FeatureTier[] =
      props.featureKey === 'CHATBOT' ? CHATBOT_TIERS : ['STANDARD'];
    if (!validTiers.includes(props.tier)) {
      throw new FeaturePriceInvariantError(
        `tier ${props.tier} is not offered for ${props.featureKey} (expected ${validTiers.join(' | ')})`,
      );
    }
    if (props.cycle !== 'MONTHLY') {
      throw new FeaturePriceInvariantError(
        `cycle ${props.cycle} is not offered yet (MONTHLY only)`,
      );
    }
    const countryCurrency = props.countryCode.spec.currency;
    if (props.currency !== countryCurrency) {
      throw new FeaturePriceInvariantError(
        `currency ${props.currency} does not match ${props.countryCode.value} (${countryCurrency})`,
      );
    }
  }
}
