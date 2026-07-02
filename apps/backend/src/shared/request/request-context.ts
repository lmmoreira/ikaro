import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { TenantSettingsData } from '../value-objects/tenant-settings-data';

interface RequestStore {
  tenantId: string;
  correlationId: string;
  settings: TenantSettingsData;
  actorId?: string;
  actorType?: 'STAFF' | 'CUSTOMER';
  actorRole?: string;
}

interface ActorInfo {
  actorId: string;
  actorType: 'STAFF' | 'CUSTOMER';
  actorRole: string;
}

const requestStorage = new AsyncLocalStorage<RequestStore>();

export function getRequestStore(): RequestStore | undefined {
  return requestStorage.getStore();
}

export function runWithRequestContext<T>(
  tenantId: string,
  correlationId: string,
  settings: TenantSettingsData,
  fn: () => T,
  actor?: ActorInfo,
): T {
  return requestStorage.run({ tenantId, correlationId, settings, ...actor }, fn);
}

@Injectable()
export class RequestContext {
  get tenantId(): string {
    return requestStorage.getStore()!.tenantId;
  }

  get correlationId(): string {
    return requestStorage.getStore()!.correlationId;
  }

  get settings(): TenantSettingsData {
    return requestStorage.getStore()!.settings;
  }

  get actorId(): string | undefined {
    return requestStorage.getStore()?.actorId;
  }

  get actorType(): 'STAFF' | 'CUSTOMER' | undefined {
    return requestStorage.getStore()?.actorType;
  }

  get actorRole(): string | undefined {
    return requestStorage.getStore()?.actorRole;
  }
}
