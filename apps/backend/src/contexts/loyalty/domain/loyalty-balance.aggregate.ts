import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import {
  LoyaltyInsufficientPointsError,
  LoyaltyInvalidPointsError,
} from './errors/loyalty-domain.error';

export interface LoyaltyBalanceProps {
  tenantId: string;
  customerId: string;
  currentPoints: number;
}

export class LoyaltyBalance extends AggregateRoot {
  private readonly props: LoyaltyBalanceProps;

  private constructor(props: LoyaltyBalanceProps) {
    super();
    this.props = props;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get customerId(): string {
    return this.props.customerId;
  }

  get currentPoints(): number {
    return this.props.currentPoints;
  }

  increment(points: number): void {
    if (points <= 0) throw new LoyaltyInvalidPointsError();
    this.props.currentPoints += points;
  }

  decrement(points: number): void {
    if (points <= 0) throw new LoyaltyInvalidPointsError();
    if (points > this.props.currentPoints) throw new LoyaltyInsufficientPointsError();
    this.props.currentPoints -= points;
  }

  static create(tenantId: string, customerId: string): LoyaltyBalance {
    return new LoyaltyBalance({ tenantId, customerId, currentPoints: 0 });
  }

  static reconstitute(props: LoyaltyBalanceProps): LoyaltyBalance {
    return new LoyaltyBalance(props);
  }
}
