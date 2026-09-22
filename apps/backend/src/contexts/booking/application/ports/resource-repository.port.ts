import { Resource } from '../../domain/resource.aggregate';
import { ResourceType } from '../../domain/resource.types';

export const RESOURCE_REPOSITORY = Symbol('IResourceRepository');

export interface ListResourcesFilter {
  type?: ResourceType;
  isActive?: boolean;
}

export interface IResourceRepository {
  findByTenant(tenantId: string, filter: ListResourcesFilter): Promise<Resource[]>;
  findById(id: string, tenantId: string): Promise<Resource | null>;
  findByRefId(refId: string, tenantId: string): Promise<Resource | null>;
  save(resource: Resource): Promise<void>;
}
