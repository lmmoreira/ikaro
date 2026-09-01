import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { uuidv7 } from '../../../shared/domain/uuid-v7';
import { TimeOfDay } from '../../../shared/value-objects/time-of-day.vo';
import { DAYS_OF_WEEK, type BusinessHours } from '../../../shared/value-objects/business-hours.vo';
import {
  ResourceAlreadyActiveError,
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
    this.props = props;
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
    return this.props.workingHours ? { ...this.props.workingHours } : null;
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
      workingHours: workingHours ? { ...workingHours } : null,
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
    } else if (Resource.isEmptyHours(tenantBusinessHours)) {
      // Mirrors Resource.create()'s own ResourceNoWorkingHoursError check (UC-045 A2) — an
      // existing resource must not be allowed to drift into the same unschedulable state
      // create() already rejects (Codex/CodeRabbit finding, PR #457 round 1).
      throw new ResourceNoWorkingHoursError();
    }
    this.props.workingHours = workingHours ? { ...workingHours } : null;
    this.props.updatedAt = new Date();
  }

  deactivate(): void {
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
    if (maxCapacity !== null && maxCapacity <= 0) {
      throw new ResourceMaxCapacityInvalidError();
    }
    if (workingHours !== null) {
      Resource.assertWorkingHoursSubsetOfTenant(workingHours, tenantBusinessHours);
    } else if (Resource.isEmptyHours(tenantBusinessHours)) {
      throw new ResourceNoWorkingHoursError();
    }
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
}
