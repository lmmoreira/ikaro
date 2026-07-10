import { BookingErrorCode } from '@ikaro/types';
import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Money } from '../../../shared/value-objects/money';
import { normalizeOptionalText, normalizeText } from '../../../shared/utils/text-normalization';
import { BookingDomainError, ServiceDeactivatedError } from './errors/booking-domain.error';

export interface ServiceProps {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  price: Money;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateServiceProps {
  tenantId: string;
  name: string;
  price: Money;
  durationMinutes: number;
  loyaltyPointsValue: number;
  requiresPickupAddress?: boolean;
  isActive?: boolean;
  description?: string;
}

export class Service extends AggregateRoot {
  private readonly props: ServiceProps;

  private constructor(props: ServiceProps) {
    super();
    this.props = props;
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get price(): Money {
    return this.props.price;
  }
  get durationMinutes(): number {
    return this.props.durationMinutes;
  }
  get loyaltyPointsValue(): number {
    return this.props.loyaltyPointsValue;
  }
  get requiresPickupAddress(): boolean {
    return this.props.requiresPickupAddress;
  }
  get isActive(): boolean {
    return this.props.isActive;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  static create({
    tenantId,
    name,
    price,
    durationMinutes,
    loyaltyPointsValue,
    requiresPickupAddress = false,
    isActive = true,
    description,
  }: CreateServiceProps): Service {
    if (!tenantId)
      throw new BookingDomainError('tenantId is required', BookingErrorCode.TENANT_ID_REQUIRED);
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new BookingDomainError('name is required', BookingErrorCode.SERVICE_NAME_REQUIRED);
    }
    if (price.amount.isNegative() || price.amount.isZero()) {
      throw new BookingDomainError(
        'price must be greater than zero',
        BookingErrorCode.SERVICE_PRICE_INVALID,
      );
    }
    if (durationMinutes <= 0) {
      throw new BookingDomainError(
        'durationMinutes must be greater than zero',
        BookingErrorCode.SERVICE_DURATION_INVALID,
      );
    }
    if (loyaltyPointsValue < 0) {
      throw new BookingDomainError(
        'loyaltyPointsValue must be non-negative',
        BookingErrorCode.SERVICE_LOYALTY_POINTS_INVALID,
      );
    }

    const now = new Date();
    return new Service({
      id: uuidv7(),
      tenantId,
      name: normalizedName,
      description: normalizeOptionalText(description),
      price,
      durationMinutes,
      loyaltyPointsValue,
      requiresPickupAddress,
      isActive,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ServiceProps): Service {
    return new Service(props);
  }

  update(
    name: string,
    description: string | null,
    price: Money,
    durationMinutes: number,
    loyaltyPointsValue: number,
    requiresPickupAddress: boolean,
  ): void {
    if (!this.props.isActive) throw new ServiceDeactivatedError();
    const normalizedName = normalizeText(name);
    if (!normalizedName) {
      throw new BookingDomainError('name is required', BookingErrorCode.SERVICE_NAME_REQUIRED);
    }
    if (price.amount.isNegative() || price.amount.isZero()) {
      throw new BookingDomainError(
        'price must be greater than zero',
        BookingErrorCode.SERVICE_PRICE_INVALID,
      );
    }
    if (durationMinutes <= 0) {
      throw new BookingDomainError(
        'durationMinutes must be greater than zero',
        BookingErrorCode.SERVICE_DURATION_INVALID,
      );
    }
    if (loyaltyPointsValue < 0) {
      throw new BookingDomainError(
        'loyaltyPointsValue must be non-negative',
        BookingErrorCode.SERVICE_LOYALTY_POINTS_INVALID,
      );
    }

    this.props.name = normalizedName;
    this.props.description = normalizeOptionalText(description);
    this.props.price = price;
    this.props.durationMinutes = durationMinutes;
    this.props.loyaltyPointsValue = loyaltyPointsValue;
    this.props.requiresPickupAddress = requiresPickupAddress;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  activate(): void {
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }
}
