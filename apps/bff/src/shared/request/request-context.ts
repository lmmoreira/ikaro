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

// Establishes the store for the whole request — called from CorrelationMiddleware, which runs
// pre-Guards, so correlationId is available unconditionally (including on a guard-rejected
// request's error logs — see enrichRequestContext below for why that matters).
export function runWithRequestContext<T>(correlationId: string, fn: () => T): T {
  return requestStorage.run({ correlationId }, fn);
}

// Mutates the already-established store in place — called from RequestInterceptor once
// JwtAuthGuard/TenantGuard have resolved req.user, i.e. after runWithRequestContext already
// ran for this request. Mutating (not re-running requestStorage.run()) means every log line
// written before this point already had correlationId, and everything from here on also gets
// tenantId/actor — same object reference throughout, so there's no second AsyncLocalStorage
// boundary to wrap intercept()'s return value in (a prior version wrapped next.handle() in a
// manual `new Observable(...)` for this exact reason, which dropped the inner RxJS subscription
// on early client disconnect — this design has no such executor to get wrong).
export function enrichRequestContext(tenantId: string, actor?: ActorInfo): void {
  const store = requestStorage.getStore();
  if (!store) {
    return; // defensive only — CorrelationMiddleware always runs first in practice
  }
  store.tenantId = tenantId;
  if (actor) {
    store.actorId = actor.actorId;
    store.actorType = actor.actorType;
    store.actorRole = actor.actorRole;
  }
}

// BFF's counterpart to the backend's RequestContext (apps/backend/src/shared/request/request-context.ts)
// — same AsyncLocalStorage shape, minus `settings`: the BFF never reads tenant settings
// directly, only proxies to the backend, so there is nothing to carry here. correlationId is
// always present once CorrelationMiddleware has run (i.e. for every request, including
// guard-rejected ones); tenantId/actor are only present once RequestInterceptor has also run,
// which — unlike the middleware — never happens for a guard-rejected request.
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
