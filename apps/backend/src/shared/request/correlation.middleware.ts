import { Injectable, NestMiddleware, Optional } from '@nestjs/common';
import { defaultTracingPort, ITracingPort } from '@ikaro/observability';
import { NextFunction, Request, Response } from 'express';
import { isUuidV7, uuidv7 } from '../domain/uuid-v7';

// M17-S31 story-discovery (2026-07-20): correlationId used to be generated inside
// RequestInterceptor, which NestJS's pipeline (Middleware -> Guards -> Interceptors ->
// Pipes -> Controller) runs *after* the global InternalApiGuard. Any request InternalApiGuard
// rejected (missing/invalid X-Internal-Key) shipped with no correlationId in RequestContext
// at all. Middleware runs before Guards, so it's populated unconditionally.
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
    // Mirrors the BFF's middleware (CodeRabbit review, 2026-07-20) — without this, only
    // error responses (via BaseErrorFilter) carried the header; a successful 2xx response
    // had no correlation id at all, unlike every error response.
    res.setHeader('X-Correlation-ID', correlationId);
    // M17-S33: set directly here, same reasoning as the header above — this is the one place
    // guaranteed to run for every request regardless of Guard outcome, so correlation.id is
    // never missing from a span the way it would be if only RequestInterceptor set it.
    this.tracingPort.setActiveSpanAttributes({ 'correlation.id': correlationId });
    next();
  }
}
