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
  ServiceBufferAfterMinutesInvalidError,
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
  assertClassResourceSlotsAvailable,
  assertClassResourceSlotsMatchBookingModel,
  assertResourceRequirementsAvailable,
} from './resource-requirement-availability';
import { ResourceRequirement } from './resource-requirement';
import { ServiceLeg } from './service-leg';
import { computeLegsTotalSpanMinutes } from './service-leg-span';
import { CreateServiceProps, ServiceBookingModel, ServiceProps } from './service.types';

// Re-exported for the many existing external call sites that import these from this file.
export type { CreateServiceProps, ServiceBookingModel, ServiceProps };

export class Service extends AggregateRoot {
  private readonly props: ServiceProps;
  // Tracks whether resourceRequirements/legs/classResourceSlots changed since this instance was
  // constructed — the repository uses this to skip the child-table wholesale delete+reinsert
  // (up to 20 legs x 20 requirements x 50 pool IDs = ~20,000 rows) on a save that only touched a
  // scalar field (name/price/isActive/etc). true on create() (initial children, if any, must be
  // persisted); false on reconstitute() until a setter below flips it.
  private childrenDirty: boolean;

  private constructor(props: ServiceProps, childrenDirty: boolean) {
    super();
    this.props = props;
    this.childrenDirty = childrenDirty;
  }

  get hasChildrenChanges(): boolean {
    return this.childrenDirty;
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

  // Split out of create() to stay under docs/CODE_STANDARDS.md's function-length limit.
  private static buildCreateProps(
    input: CreateServiceProps,
    normalizedName: string,
    classResourceSlots: ClassResourceSlot[],
  ): ServiceProps {
    const {
      tenantId,
      price,
      durationMinutes,
      loyaltyPointsValue,
      requiresPickupAddress = false,
      isActive = true,
      description,
      bookingModel = 'APPOINTMENT',
      tenantServiceBufferMinutes = null,
    } = input;
    const isSession = bookingModel === 'SESSION';
    const now = new Date();
    return {
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
    };
  }

  static create(input: CreateServiceProps): Service {
    const {
      tenantId,
      name,
      price,
      durationMinutes,
      loyaltyPointsValue,
      bookingModel = 'APPOINTMENT',
      classResourceSlots = [],
      activeResourceIdsByType = new Map(),
    } = input;
    if (!tenantId) throw new TenantIdRequiredError();
    const normalizedName = Service.validateFields(name, price, durationMinutes, loyaltyPointsValue);
    assertClassResourceSlotsMatchBookingModel(bookingModel, classResourceSlots);
    // Same eligibility checklist as UC-050's flat case (UC-056 step 3, docs/02-DOMAIN_MODEL.md) —
    // duplicate-type rejection plus "each eligibleResourceIds entry is an active resource of the
    // matching type." See resource-requirement-availability.ts's identical treatment of
    // resourceRequirements/legs.
    assertClassResourceSlotsAvailable(classResourceSlots, activeResourceIdsByType);
    return new Service(Service.buildCreateProps(input, normalizedName, classResourceSlots), true);
  }

  static reconstitute(props: ServiceProps): Service {
    return new Service(props, false);
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
    this.childrenDirty = true;
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
    // Stored in legIndex order (not submission order) so this in-memory aggregate always agrees
    // with what a reload would return — the mapper's own read path sorts by legIndex
    // (typeorm-service.mapper.ts), and setLegs() only rejects duplicate indexes, never out-of-
    // order ones, so the caller's array order can't be trusted as itinerary order.
    const orderedLegs = [...legs].sort((a, b) => a.legIndex - b.legIndex);
    this.props.legs = orderedLegs;
    this.props.resourceRequirements = [];
    this.props.bufferAfterMinutes = null;
    this.props.updatedAt = new Date();
    this.childrenDirty = true;
    return computeLegsTotalSpanMinutes(orderedLegs);
  }

  setBufferAfterMinutes(bufferAfterMinutes: number): void {
    if (this.props.bookingModel !== 'APPOINTMENT') {
      throw new BookingServiceBookingModelMismatchError(this.props.id);
    }
    if (this.props.legs !== null) throw new BookingServiceHasLegsError(this.props.id);
    if (bufferAfterMinutes < 0) throw new ServiceBufferAfterMinutesInvalidError();
    this.props.bufferAfterMinutes = bufferAfterMinutes;
    this.props.updatedAt = new Date();
  }

  // Compare-before-validate (CLAUDE.md §8): resubmitting the current value is always a no-op,
  // even with booking history. hasBookingHistory is resolved by the caller (existsByServiceId).
  // Switching model normalizes the fields that only apply to the other model (mutual-exclusivity
  // invariant, docs/02-DOMAIN_MODEL.md) — never leaves a stale resourceRequirements/legs/buffer
  // behind on a SESSION service, nor a stale classResourceSlots behind on an APPOINTMENT one.
  // classResourceSlots/activeResourceIdsByType are only meaningful when converting TO SESSION —
  // same shape as create()'s identical params, resolved by the caller (IResourceRepository.
  // findByTenant). A conversion to SESSION always requires slots supplied in the same call, since
  // there is no separate slot-management endpoint this milestone.
  changeBookingModel(
    bookingModel: ServiceBookingModel,
    hasBookingHistory: boolean,
    classResourceSlots: ClassResourceSlot[] = [],
    activeResourceIdsByType: ActiveResourceIdsByType = new Map(),
  ): void {
    if (bookingModel === this.props.bookingModel) return;
    if (hasBookingHistory) throw new BookingServiceBookingModelImmutableError(this.props.id);
    assertClassResourceSlotsMatchBookingModel(bookingModel, classResourceSlots);
    if (bookingModel === 'SESSION') {
      assertClassResourceSlotsAvailable(classResourceSlots, activeResourceIdsByType);
    }
    this.props.bookingModel = bookingModel;
    if (bookingModel === 'SESSION') {
      this.props.resourceRequirements = [];
      this.props.legs = null;
      this.props.bufferAfterMinutes = null;
      this.props.classResourceSlots = classResourceSlots;
    } else {
      this.props.classResourceSlots = null;
    }
    this.props.updatedAt = new Date();
    this.childrenDirty = true;
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
