import type { FeatureKey } from '@ikaro/validation';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { SubscriptionInvariantError } from './errors/billing-domain.error';
import type { FeatureTier } from './feature-price.aggregate';
import { assertValidTier } from './plan-selection';

export interface SubscriptionItemProps {
  id: string;
  featureKey: FeatureKey;
  tier: FeatureTier;
  startsAt: Date;
  // NULL = open-ended: the plan continues until something changes it.
  endsAt: Date | null;
  // The operator id, the manager's actor id, or 'SYSTEM' — never empty.
  createdBy: string;
}

export type NewSubscriptionItem = Omit<SubscriptionItemProps, 'id'>;

/**
 * One feature of the SELECTED plan over a half-open window `[startsAt, endsAt)`. It carries no
 * price and no payment state: what a period costs is a Charge's snapshot (M26). Immutable — ending
 * an item returns a new one, so the aggregate can tell a changed row from an untouched one by id.
 */
export class SubscriptionItem {
  readonly id: string;
  readonly featureKey: FeatureKey;
  readonly tier: FeatureTier;
  readonly startsAt: Date;
  readonly endsAt: Date | null;
  readonly createdBy: string;

  private constructor(props: SubscriptionItemProps) {
    this.id = props.id;
    this.featureKey = props.featureKey;
    this.tier = props.tier;
    this.startsAt = props.startsAt;
    this.endsAt = props.endsAt;
    this.createdBy = props.createdBy;
  }

  static create(props: NewSubscriptionItem): SubscriptionItem {
    if (props.createdBy.trim() === '') {
      throw new SubscriptionInvariantError('A subscription item needs a non-empty createdBy');
    }
    assertValidTier(props);
    if (props.endsAt !== null && props.endsAt.getTime() <= props.startsAt.getTime()) {
      throw new SubscriptionInvariantError('A subscription item must end after it starts');
    }
    return new SubscriptionItem({ ...props, id: uuidv7() });
  }

  static reconstitute(props: SubscriptionItemProps): SubscriptionItem {
    return new SubscriptionItem(props);
  }

  /** Active at `now` when `startsAt <= now AND (endsAt IS NULL OR endsAt > now)`. */
  isActiveAt(now: Date): boolean {
    return (
      this.startsAt.getTime() <= now.getTime() &&
      (this.endsAt === null || this.endsAt.getTime() > now.getTime())
    );
  }

  /** Whether the item's window has not opened yet at `now` (a plan not in force: replaceable). */
  startsAfter(now: Date): boolean {
    return this.startsAt.getTime() > now.getTime();
  }

  /** Whether two windows of the SAME feature overlap (touching windows `[a,b) [b,c)` do not). */
  overlaps(other: SubscriptionItem): boolean {
    if (this.featureKey !== other.featureKey) return false;
    const thisEnd = this.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const otherEnd = other.endsAt?.getTime() ?? Number.POSITIVE_INFINITY;
    return this.startsAt.getTime() < otherEnd && other.startsAt.getTime() < thisEnd;
  }

  /** The same item ended at `endsAt` (strictly after its start). */
  endedAt(endsAt: Date): SubscriptionItem {
    if (endsAt.getTime() <= this.startsAt.getTime()) {
      throw new SubscriptionInvariantError('A subscription item must end after it starts');
    }
    return new SubscriptionItem({ ...this, endsAt });
  }
}
