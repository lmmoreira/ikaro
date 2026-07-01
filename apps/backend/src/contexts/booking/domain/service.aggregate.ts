import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Money } from '../../../shared/value-objects/money';
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
    if (!tenantId) throw new BookingDomainError('tenantId is required');
    const trimmedName = name?.trim();
    if (!trimmedName) throw new BookingDomainError('name is required');
    if (price.amount.isNegative() || price.amount.isZero()) {
      throw new BookingDomainError('price must be greater than zero');
    }
    if (durationMinutes <= 0) {
      throw new BookingDomainError('durationMinutes must be greater than zero');
    }
    if (loyaltyPointsValue < 0) {
      throw new BookingDomainError('loyaltyPointsValue must be non-negative');
    }

    const now = new Date();
    return new Service({
      id: uuidv7(),
      tenantId,
      name: trimmedName,
      description: description?.trim() ?? null,
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
    const trimmedName = name?.trim();
    if (!trimmedName) throw new BookingDomainError('name is required');
    if (price.amount.isNegative() || price.amount.isZero()) {
      throw new BookingDomainError('price must be greater than zero');
    }
    if (durationMinutes <= 0) {
      throw new BookingDomainError('durationMinutes must be greater than zero');
    }
    if (loyaltyPointsValue < 0) {
      throw new BookingDomainError('loyaltyPointsValue must be non-negative');
    }

    this.props.name = trimmedName;
    this.props.description = description?.trim() ?? null;
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
