import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { LoyaltyInvalidPointsError } from './errors/loyalty-domain.error';
import { ServicePointsEarned } from './events/service-points-earned.event';

export interface LoyaltyEntryProps {
  id: string;
  tenantId: string;
  customerId: string;
  bookingId: string;
  bookingLineId: string;
  serviceId: string;
  points: number;
  earnedAt: Date;
  expiresAt: Date;
}

export interface RecordLoyaltyEntryParams {
  tenantId: string;
  customerId: string;
  bookingId: string;
  bookingLineId: string;
  serviceId: string;
  points: number;
  expiryDays: number;
  correlationId: string;
}

export class LoyaltyEntry extends AggregateRoot {
  private readonly props: LoyaltyEntryProps;

  private constructor(props: LoyaltyEntryProps) {
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
  get bookingId(): string {
    return this.props.bookingId;
  }
  get bookingLineId(): string {
    return this.props.bookingLineId;
  }
  get serviceId(): string {
    return this.props.serviceId;
  }
  get points(): number {
    return this.props.points;
  }
  get earnedAt(): Date {
    return this.props.earnedAt;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  static record(params: RecordLoyaltyEntryParams): LoyaltyEntry {
    const {
      tenantId,
      customerId,
      bookingId,
      bookingLineId,
      serviceId,
      points,
      expiryDays,
      correlationId,
    } = params;
    if (points <= 0) throw new LoyaltyInvalidPointsError();

    const earnedAt = new Date();
    const expiresAt = new Date(earnedAt.getTime() + expiryDays * 24 * 60 * 60 * 1000);
    const id = uuidv7();

    const entry = new LoyaltyEntry({
      id,
      tenantId,
      customerId,
      bookingId,
      bookingLineId,
      serviceId,
      points,
      earnedAt,
      expiresAt,
    });

    entry.addDomainEvent(
      new ServicePointsEarned(tenantId, correlationId, {
        entryId: id,
        customerId,
        bookingId,
        bookingLineId,
        serviceId,
        pointsEarned: points,
        earnedAt: earnedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      }),
    );

    return entry;
  }

  static reconstitute(props: LoyaltyEntryProps): LoyaltyEntry {
    return new LoyaltyEntry(props);
  }
}
