import { Resource } from '../../../contexts/booking/domain/resource.aggregate';
import {
  ResourceType,
  ResourceWorkingHours,
} from '../../../contexts/booking/domain/resource.types';
import { FULL_WEEK_BUSINESS_HOURS } from '../../utils/business-hours-fixtures';

export class ResourceBuilder {
  private tenantId = '00000000-0000-7000-8000-000000000001';
  private type: ResourceType = ResourceType.ROOM;
  private name = 'Estúdio 1';
  private tenantBusinessHours = FULL_WEEK_BUSINESS_HOURS;
  private workingHours: ResourceWorkingHours | null | undefined = undefined;
  private refId: string | null | undefined = undefined;
  private maxCapacity: number | null | undefined = undefined;
  private turnoverMinutes: number | undefined = undefined;

  withTenantId(tenantId: string): this {
    this.tenantId = tenantId;
    return this;
  }

  withType(type: ResourceType): this {
    this.type = type;
    return this;
  }

  withName(name: string): this {
    this.name = name;
    return this;
  }

  withTenantBusinessHours(hours: typeof FULL_WEEK_BUSINESS_HOURS): this {
    this.tenantBusinessHours = hours;
    return this;
  }

  withWorkingHours(workingHours: ResourceWorkingHours | null): this {
    this.workingHours = workingHours;
    return this;
  }

  withRefId(refId: string | null): this {
    this.refId = refId;
    return this;
  }

  withMaxCapacity(maxCapacity: number | null): this {
    this.maxCapacity = maxCapacity;
    return this;
  }

  withTurnoverMinutes(turnoverMinutes: number): this {
    this.turnoverMinutes = turnoverMinutes;
    return this;
  }

  build(): Resource {
    return Resource.create(
      this.tenantId,
      this.type,
      this.name,
      this.tenantBusinessHours,
      this.workingHours,
      this.refId,
      this.maxCapacity,
      this.turnoverMinutes,
    );
  }
}
