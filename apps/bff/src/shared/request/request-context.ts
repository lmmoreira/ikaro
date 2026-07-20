import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

interface RequestStore {
  correlationId: string;
  tenantId?: string;
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
  correlationId: string,
  fn: () => T,
  tenantId?: string,
  actor?: ActorInfo,
): T {
  return requestStorage.run({ correlationId, tenantId, ...actor }, fn);
}

// BFF's counterpart to the backend's RequestContext (apps/backend/src/shared/request/request-context.ts)
// — same AsyncLocalStorage shape, minus `settings`: the BFF never reads tenant settings
// directly, only proxies to the backend, so there is nothing to carry here. Populated by
// RequestInterceptor from `req.user` (JWT) and the X-Correlation-ID header, so — unlike
// correlationId, which CorrelationMiddleware guarantees unconditionally pre-Guards —
// tenantId/actor fields are only ever present once JwtAuthGuard/TenantGuard have already
// resolved the caller; a guard-rejected request never reaches this store at all.
@Injectable()
export class RequestContext {
  get correlationId(): string {
    return requestStorage.getStore()!.correlationId;
  }

  get tenantId(): string | undefined {
    return requestStorage.getStore()?.tenantId;
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
