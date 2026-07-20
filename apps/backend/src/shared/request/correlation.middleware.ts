import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { uuidv7 } from '../domain/uuid-v7';

// M17-S31 story-discovery (2026-07-20): correlationId used to be generated inside
// RequestInterceptor, which NestJS's pipeline (Middleware -> Guards -> Interceptors ->
// Pipes -> Controller) runs *after* the global InternalApiGuard. Any request InternalApiGuard
// rejected (missing/invalid X-Internal-Key) shipped with no correlationId in RequestContext
// at all. Middleware runs before Guards, so it's populated unconditionally.
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction): void {
    const incoming = req.headers['x-correlation-id'];
    req.headers['x-correlation-id'] = typeof incoming === 'string' ? incoming : uuidv7();
    next();
  }
}
