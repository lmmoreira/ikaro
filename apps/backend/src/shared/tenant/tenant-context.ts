import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

interface TenantStore {
  tenantId: string;
  correlationId: string;
  actorId?: string;
  actorType?: 'STAFF' | 'CUSTOMER';
  actorRole?: string;
}

interface ActorInfo {
  actorId: string;
  actorType: 'STAFF' | 'CUSTOMER';
  actorRole: string;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getTenantStore(): TenantStore | undefined {
  return tenantStorage.getStore();
}

export function runWithTenantContext<T>(
  tenantId: string,
  correlationId: string,
  fn: () => T,
  actor?: ActorInfo,
): T {
  return tenantStorage.run({ tenantId, correlationId, ...actor }, fn);
}

@Injectable()
export class TenantContext {
  get tenantId(): string {
    return tenantStorage.getStore()!.tenantId;
  }

  get correlationId(): string {
    return tenantStorage.getStore()!.correlationId;
  }

  get actorId(): string | undefined {
    return tenantStorage.getStore()?.actorId;
  }

  get actorType(): 'STAFF' | 'CUSTOMER' | undefined {
    return tenantStorage.getStore()?.actorType;
  }

  get actorRole(): string | undefined {
    return tenantStorage.getStore()?.actorRole;
  }
}
