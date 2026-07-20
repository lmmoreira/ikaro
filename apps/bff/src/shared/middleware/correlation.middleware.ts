import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { isUuidV7, uuidv7 } from '../domain/uuid-v7';

// Replaces the former CorrelationInterceptor (TD23/M17-S31 story-discovery, 2026-07-20).
// Must be middleware, not an Interceptor: NestJS's pipeline is Middleware -> Guards ->
// Interceptors -> Pipes -> Controller. AppModule registers five global guards
// (AppThrottlerGuard, JwtAuthGuard, TenantGuard, RolesGuard, ActiveStaffGuard) — an
// Interceptor-based generator never ran when any of them rejected a request, so every
// 401/403/429 shipped with no correlation id at all, in header or body. Middleware runs
// before Guards, so it's populated unconditionally for every request.
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-correlation-id'];
    // Never trust an incoming value verbatim (M17-S31 review, 2026-07-20) — an unvalidated
    // client-supplied string would be reflected into logs/traces, letting a caller poison
    // trace searches or forge a collision with a real correlation id. Only a value already
    // matching this app's own uuidv7() contract survives; anything else is replaced.
    const correlationId = typeof incoming === 'string' && isUuidV7(incoming) ? incoming : uuidv7();
    req.headers['x-correlation-id'] = correlationId;
    res.setHeader('X-Correlation-ID', correlationId);
    next();
  }
}
