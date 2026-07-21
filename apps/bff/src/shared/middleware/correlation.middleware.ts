import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { defaultTracingPort, ITracingPort } from '@ikaro/observability';
import { NextFunction, Request, Response } from 'express';
import { isUuidV7, uuidv7 } from '../domain/uuid-v7';
import { runWithRequestContext } from '../request/request-context';

// Replaces the former CorrelationInterceptor (TD23/M17-S31 story-discovery, 2026-07-20).
// Must be middleware, not an Interceptor: NestJS's pipeline is Middleware -> Guards ->
// Interceptors -> Pipes -> Controller. AppModule registers five global guards
// (AppThrottlerGuard, JwtAuthGuard, TenantGuard, RolesGuard, ActiveStaffGuard) — an
// Interceptor-based generator never ran when any of them rejected a request, so every
// 401/403/429 shipped with no correlation id at all, in header or body. Middleware runs
// before Guards, so it's populated unconditionally for every request.
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  // @Optional() so Nest's DI container doesn't throw trying to resolve an interface token when
  // no provider is bound for it — falls through to the default, same pattern as AppLogger's
  // vendorFormatter param (packages/observability/src/app-logger.ts).
  constructor(@Optional() private readonly tracingPort: ITracingPort = defaultTracingPort) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-correlation-id'];
    // Never trust an incoming value verbatim (M17-S31 review, 2026-07-20) — an unvalidated
    // client-supplied string would be reflected into logs/traces, letting a caller poison
    // trace searches or forge a collision with a real correlation id. Only a value already
    // matching this app's own uuidv7() contract survives; anything else is replaced.
    const correlationId = typeof incoming === 'string' && isUuidV7(incoming) ? incoming : uuidv7();
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    // M17-S33: set directly here, same reasoning as the header above — this is the one place
    // guaranteed to run for every request regardless of Guard outcome, so correlation.id is
    // never missing from a span the way it would be if only RequestInterceptor set it.
    this.tracingPort.setActiveSpanAttributes({ 'correlation.id': correlationId });
    // M17-S33 (security review follow-up, 2026-07-21): establish the AsyncLocalStorage context
    // here too, not just in RequestInterceptor — that interceptor only runs post-Guards, so a
    // rejected request's error log (BaseErrorFilter, via AppLogger.enrich()) previously carried
    // no correlationId at all despite the response header/body having one. Running the rest of
    // the pipeline inside this context means every log line from here on can see correlationId;
    // RequestInterceptor enriches the same store with tenantId/actor once known.
    runWithRequestContext(correlationId, () => next());
  }
}
