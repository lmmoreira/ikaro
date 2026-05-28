import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';

export interface LoyaltyRedemptionProps {
  id: string;
  tenantId: string;
  customerId: string;
  pointsRedeemed: number;
  redeemedBy: string;
  notes: string | null;
  bookingId: string | null;
  redeemedAt: Date;
}

export interface RecordLoyaltyRedemptionParams {
  tenantId: string;
  customerId: string;
  pointsRedeemed: number;
  redeemedBy: string;
  notes?: string | null;
  bookingId?: string | null;
}

export class LoyaltyRedemption extends AggregateRoot {
  private readonly props: LoyaltyRedemptionProps;

  private constructor(props: LoyaltyRedemptionProps) {
    super();
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get customerId(): string {
    return this.props.customerId;
  }

  get pointsRedeemed(): number {
    return this.props.pointsRedeemed;
  }

  get redeemedBy(): string {
    return this.props.redeemedBy;
  }

  get notes(): string | null {
    return this.props.notes;
  }

  get bookingId(): string | null {
    return this.props.bookingId;
  }

  get redeemedAt(): Date {
    return this.props.redeemedAt;
  }

  static record(params: RecordLoyaltyRedemptionParams): LoyaltyRedemption {
    return new LoyaltyRedemption({
      id: uuidv7(),
      tenantId: params.tenantId,
      customerId: params.customerId,
      pointsRedeemed: params.pointsRedeemed,
      redeemedBy: params.redeemedBy,
      notes: params.notes ?? null,
      bookingId: params.bookingId ?? null,
      redeemedAt: new Date(),
    });
  }

  static reconstitute(props: LoyaltyRedemptionProps): LoyaltyRedemption {
    return new LoyaltyRedemption(props);
  }
}
