import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { Money } from '../../../shared/value-objects/money';
import { normalizeOptionalText, normalizeText } from '../../../shared/utils/text-normalization';
import { ClassResourceSlot } from './class-resource-slot';
import {
  BookingServiceBookingModelImmutableError,
  BookingServiceBookingModelMismatchError,
  BookingServiceHasLegsError,
  BookingServiceLegsTooFewError,
  ServiceDeactivatedError,
  ServiceDurationInvalidError,
  ServiceLegInvalidError,
  ServiceLoyaltyPointsInvalidError,
  ServiceNameRequiredError,
  ServicePriceInvalidError,
  TenantIdRequiredError,
} from './errors/booking-domain.error';
import {
  ActiveResourceIdsByType,
  assertResourceRequirementsAvailable,
} from './resource-requirement-availability';
import { ResourceRequirement } from './resource-requirement';
import { ServiceLeg } from './service-leg';
import { computeLegsTotalSpanMinutes } from './service-leg-span';

export type ServiceBookingModel = 'APPOINTMENT' | 'SESSION';

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
  bookingModel: ServiceBookingModel;
  resourceRequirements: ResourceRequirement[];
  bufferAfterMinutes: number | null;
  legs: ServiceLeg[] | null;
  classResourceSlots: ClassResourceSlot[] | null;
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
  bookingModel?: ServiceBookingModel;
  // Tenant's current settings.serviceBufferMinutes, snapshotted by the caller at creation time
  // (UC-053 step 1). Ignored for a SESSION service.
  tenantServiceBufferMinutes?: number | null;
  classResourceSlots?: ClassResourceSlot[];
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
  get bookingModel(): ServiceBookingModel {
    return this.props.bookingModel;
  }
  get resourceRequirements(): ResourceRequirement[] {
    return [...this.props.resourceRequirements];
  }
  get bufferAfterMinutes(): number | null {
    return this.props.bufferAfterMinutes;
  }
  get legs(): ServiceLeg[] | null {
    return this.props.legs ? [...this.props.legs] : null;
  }
  get classResourceSlots(): ClassResourceSlot[] | null {
    return this.props.classResourceSlots ? [...this.props.classResourceSlots] : null;
  }

  private static validateFields(
    name: string,
    price: Money,
    durationMinutes: number,
    loyaltyPointsValue: number,
  ): string {
    const normalizedName = normalizeText(name);
    if (!normalizedName) throw new ServiceNameRequiredError();
    if (price.amount.isNegative() || price.amount.isZero()) throw new ServicePriceInvalidError();
    if (durationMinutes <= 0) throw new ServiceDurationInvalidError();
    if (loyaltyPointsValue < 0) throw new ServiceLoyaltyPointsInvalidError();
    return normalizedName;
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
    bookingModel = 'APPOINTMENT',
    tenantServiceBufferMinutes = null,
    classResourceSlots = [],
  }: CreateServiceProps): Service {
    if (!tenantId) throw new TenantIdRequiredError();
    const normalizedName = Service.validateFields(name, price, durationMinutes, loyaltyPointsValue);

    const isSession = bookingModel === 'SESSION';
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
      bookingModel,
      resourceRequirements: [],
      bufferAfterMinutes: isSession ? null : tenantServiceBufferMinutes,
      legs: null,
      classResourceSlots: isSession ? classResourceSlots : null,
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
    const normalizedName = Service.validateFields(name, price, durationMinutes, loyaltyPointsValue);

    this.props.name = normalizedName;
    this.props.description = normalizeOptionalText(description);
    this.props.price = price;
    this.props.durationMinutes = durationMinutes;
    this.props.loyaltyPointsValue = loyaltyPointsValue;
    this.props.requiresPickupAddress = requiresPickupAddress;
    this.props.updatedAt = new Date();
  }

  // Rejects (409) rather than auto-clearing legs — legged→flat isn't a supported transition via
  // this endpoint, asymmetric with setLegs() below (UC-050/051 A2 vs. UC-052 step 3).
  // activeResourceIdsByType is resolved by the caller (IResourceRepository.findByTenant).
  setResourceRequirements(
    requirements: ResourceRequirement[],
    activeResourceIdsByType: ActiveResourceIdsByType,
  ): void {
    if (this.props.bookingModel !== 'APPOINTMENT') {
      throw new BookingServiceBookingModelMismatchError(this.props.id);
    }
    if (this.props.legs !== null) throw new BookingServiceHasLegsError(this.props.id);
    assertResourceRequirementsAvailable(requirements, activeResourceIdsByType);
    this.props.resourceRequirements = [...requirements];
    this.props.updatedAt = new Date();
  }

  setLegs(legs: ServiceLeg[], activeResourceIdsByType: ActiveResourceIdsByType): number {
    if (this.props.bookingModel !== 'APPOINTMENT') {
      throw new BookingServiceBookingModelMismatchError(this.props.id);
    }
    if (legs.length < 2) throw new BookingServiceLegsTooFewError();
    const legIndexes = legs.map((leg) => leg.legIndex);
    if (new Set(legIndexes).size !== legIndexes.length) {
      throw new ServiceLegInvalidError('duplicate-leg-index');
    }
    for (const leg of legs) {
      assertResourceRequirementsAvailable(leg.resourceRequirements, activeResourceIdsByType);
    }
    this.props.legs = [...legs];
    this.props.resourceRequirements = [];
    this.props.bufferAfterMinutes = null;
    this.props.updatedAt = new Date();
    return computeLegsTotalSpanMinutes(legs);
  }

  setBufferAfterMinutes(bufferAfterMinutes: number): void {
    if (this.props.bookingModel !== 'APPOINTMENT') {
      throw new BookingServiceBookingModelMismatchError(this.props.id);
    }
    if (this.props.legs !== null) throw new BookingServiceHasLegsError(this.props.id);
    this.props.bufferAfterMinutes = bufferAfterMinutes;
    this.props.updatedAt = new Date();
  }

  // Compare-before-validate (CLAUDE.md §8): resubmitting the current value is always a no-op,
  // even with booking history. hasBookingHistory is resolved by the caller (existsByServiceId).
  // Switching model normalizes the fields that only apply to the other model (mutual-exclusivity
  // invariant, docs/02-DOMAIN_MODEL.md) — never leaves a stale resourceRequirements/legs/buffer
  // behind on a SESSION service, nor a stale classResourceSlots behind on an APPOINTMENT one.
  changeBookingModel(bookingModel: ServiceBookingModel, hasBookingHistory: boolean): void {
    if (bookingModel === this.props.bookingModel) return;
    if (hasBookingHistory) throw new BookingServiceBookingModelImmutableError(this.props.id);
    this.props.bookingModel = bookingModel;
    if (bookingModel === 'SESSION') {
      this.props.resourceRequirements = [];
      this.props.legs = null;
      this.props.bufferAfterMinutes = null;
      this.props.classResourceSlots = this.props.classResourceSlots ?? [];
    } else {
      this.props.classResourceSlots = null;
    }
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
