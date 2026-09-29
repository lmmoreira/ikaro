import { ScheduleClosure } from '../../domain/schedule-closure.aggregate';

export const SCHEDULE_CLOSURE_REPOSITORY = Symbol('IScheduleClosureRepository');

export interface IScheduleClosureRepository {
  findByTenantAndDateRange(
    tenantId: string,
    from: string,
    to: string,
    resourceId?: string,
  ): Promise<ScheduleClosure[]>;
  /** Resource-scoped closures for several resources in one query (never tenant-wide ones) —
   * keeps a multi-resource check's query count independent of how many resources it considers. */
  findByTenantAndResourcesAndDateRange(
    tenantId: string,
    resourceIds: string[],
    from: string,
    to: string,
  ): Promise<ScheduleClosure[]>;
  findByTenantAndDate(
    tenantId: string,
    date: string,
    resourceId?: string,
  ): Promise<ScheduleClosure[]>;
  findById(id: string, tenantId: string): Promise<ScheduleClosure | null>;
  save(closure: ScheduleClosure): Promise<void>;
  delete(id: string, tenantId: string): Promise<void>;
}
