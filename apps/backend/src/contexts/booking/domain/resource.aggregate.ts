import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import { DAYS_OF_WEEK, type BusinessHours } from '../../../shared/value-objects/business-hours.vo';
import {
  ResourceAlreadyActiveError,
  ResourceLocationCannotBeDeactivatedError,
  ResourceMaxCapacityInvalidError,
  ResourceNoWorkingHoursError,
  ResourceTypeRefIdMismatchError,
  ResourceWorkingHoursOutsideTenantHoursError,
} from './errors/resource.error';
import { ResourceType, ResourceWorkingHours } from './resource.types';

export interface ResourceProps {
  id: string;
  tenantId: string;
  type: ResourceType;
  refId: string | null;
  name: string;
  workingHours: ResourceWorkingHours | null;
  turnoverMinutes: number;
  maxCapacity: number | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateResourceOptions {
  tenantId: string;
  type: ResourceType;
  name: string;
  tenantBusinessHours: BusinessHours;
  workingHours?: ResourceWorkingHours | null;
  refId?: string | null;
  maxCapacity?: number | null;
  turnoverMinutes?: number;
}

export class Resource extends AggregateRoot {
  private readonly props: ResourceProps;

  private constructor(props: ResourceProps) {
    super();
    // Clones workingHours here — the one place every entry point (create/reconstitute) passes
    // through — so a caller can never retain a live reference into stored state, whether via a
    // props object built by the repository mapper or one passed directly by a test.
    this.props = { ...props, workingHours: Resource.cloneWorkingHours(props.workingHours) };
  }

  get id(): string {
    return this.props.id;
  }
  get tenantId(): string {
    return this.props.tenantId;
  }
  get type(): ResourceType {
    return this.props.type;
  }
  get refId(): string | null {
    return this.props.refId;
  }
  get name(): string {
    return this.props.name;
  }
  get workingHours(): ResourceWorkingHours | null {
    return Resource.cloneWorkingHours(this.props.workingHours);
  }
  get turnoverMinutes(): number {
    return this.props.turnoverMinutes;
  }
  get maxCapacity(): number | null {
    return this.props.maxCapacity;
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

  static create(options: CreateResourceOptions): Resource {
    const {
      tenantId,
      type,
      name,
      tenantBusinessHours,
      workingHours = null,
      refId = null,
      maxCapacity = null,
      turnoverMinutes = 0,
    } = options;

    Resource.assertValid(type, refId, workingHours, tenantBusinessHours, maxCapacity);
    const now = new Date();
    return new Resource({
      id: uuidv7(),
      tenantId,
      type,
      refId: type === ResourceType.STAFF ? refId : null,
      name,
      workingHours, // the constructor clones this — see private constructor
      turnoverMinutes,
      maxCapacity,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ResourceProps): Resource {
    return new Resource(props);
  }

  updateWorkingHours(
    workingHours: ResourceWorkingHours | null,
    tenantBusinessHours: BusinessHours,
  ): void {
    if (workingHours !== null) {
      Resource.assertWorkingHoursSubsetOfTenant(workingHours, tenantBusinessHours);
    }
    // Mirrors Resource.create()'s own ResourceNoWorkingHoursError check (UC-045 A2) — an
    // existing resource must not be allowed to drift into the same unschedulable state
    // create() already rejects (Codex/CodeRabbit finding, PR #457 round 1).
    Resource.assertHasSomeSchedule(workingHours, tenantBusinessHours);
    this.props.workingHours = Resource.cloneWorkingHours(workingHours);
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
    // A tenant must always retain exactly one active LOCATION resource — it's never manually
    // created (only the M21-S02 backfill produces it) and, symmetrically, never manually
    // deactivated either (docs/02-DOMAIN_MODEL.md § Resource: "Exactly one active LOCATION
    // resource per tenant"; Codex round-6 finding, PR #457).
    if (this.props.type === ResourceType.LOCATION) {
      throw new ResourceLocationCannotBeDeactivatedError(this.props.id);
    }
    this.props.isActive = false;
    this.props.updatedAt = new Date();
  }

  reactivate(): void {
    if (this.props.isActive) throw new ResourceAlreadyActiveError(this.props.id);
    this.props.isActive = true;
    this.props.updatedAt = new Date();
  }

  private static assertValid(
    type: ResourceType,
    refId: string | null,
    workingHours: ResourceWorkingHours | null,
    tenantBusinessHours: BusinessHours,
    maxCapacity: number | null,
  ): void {
    const hasRefId = refId !== null;
    if ((type === ResourceType.STAFF) !== hasRefId) {
      throw new ResourceTypeRefIdMismatchError();
    }
    // maxCapacity is a physical ceiling for LOCATION/ROOM/EQUIPMENT only — never set for
    // STAFF (docs/02-DOMAIN_MODEL.md § Resource, docs/13-DATABASE_SCHEMA.md § booking.resources,
    // Codex round-5 finding, PR #457).
    if (type === ResourceType.STAFF && maxCapacity !== null) {
      throw new ResourceMaxCapacityInvalidError('must-be-null-for-staff');
    }
    if (maxCapacity !== null && maxCapacity <= 0) {
      throw new ResourceMaxCapacityInvalidError();
    }
    if (workingHours !== null) {
      Resource.assertWorkingHoursSubsetOfTenant(workingHours, tenantBusinessHours);
    }
    Resource.assertHasSomeSchedule(workingHours, tenantBusinessHours);
  }

  private static assertWorkingHoursSubsetOfTenant(
    workingHours: ResourceWorkingHours,
    tenantBusinessHours: BusinessHours,
  ): void {
    for (const day of DAYS_OF_WEEK) {
      const resourceDay = workingHours[day];
      if (resourceDay === null) continue;

      const tenantDay = tenantBusinessHours[day];
      if (
        tenantDay === null ||
        resourceDay.open < tenantDay.open ||
        resourceDay.close > tenantDay.close
      ) {
        throw new ResourceWorkingHoursOutsideTenantHoursError(day);
      }
      if (!TimeOfDay.create(resourceDay.open).isBefore(TimeOfDay.create(resourceDay.close))) {
        throw new ResourceWorkingHoursOutsideTenantHoursError(day);
      }
    }
  }

  // Accepts BusinessHours too — it structurally satisfies ResourceWorkingHours (same 7 day
  // keys plus an extra `timezone` field, which is fine for a non-literal argument).
  private static isEmptyHours(hours: ResourceWorkingHours): boolean {
    return DAYS_OF_WEEK.every((day) => hours[day] === null);
  }

  // A non-null workingHours object with every day set to null (e.g. every DayHours explicitly
  // closed) is not the same value as `workingHours === null`, but represents the identical
  // unschedulable state — assertWorkingHoursSubsetOfTenant() is a silent no-op for it (nothing
  // to validate against tenant hours), so without this check it bypassed the "no resource hours
  // and no tenant hours either" rule entirely (Codex round-5 finding, PR #457).
  private static assertHasSomeSchedule(
    workingHours: ResourceWorkingHours | null,
    tenantBusinessHours: BusinessHours,
  ): void {
    const resourceHasNoHours = workingHours === null || Resource.isEmptyHours(workingHours);
    if (resourceHasNoHours && Resource.isEmptyHours(tenantBusinessHours)) {
      throw new ResourceNoWorkingHoursError();
    }
  }

  // A shallow `{ ...workingHours }` only copies the top-level 7 day keys — each day's
  // `{ open, close }` sub-object stays shared by reference with the caller (on write) or the
  // stored props (on read), letting a caller mutate `resource.workingHours.monday.open` and
  // silently corrupt validated state without going through updateWorkingHours() (Codex round-4
  // finding, PR #457). Clone every level.
  private static cloneWorkingHours(
    workingHours: ResourceWorkingHours | null,
  ): ResourceWorkingHours | null {
    if (workingHours === null) return null;
    const cloned = {} as ResourceWorkingHours;
    for (const day of DAYS_OF_WEEK) {
      const dayHours = workingHours[day];
      cloned[day] = dayHours ? { ...dayHours } : null;
    }
    return cloned;
  }
}
