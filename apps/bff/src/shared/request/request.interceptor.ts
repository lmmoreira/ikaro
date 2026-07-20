import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { runWithRequestContext } from './request-context';

// Runs after Guards (NestJS pipeline: Middleware -> Guards -> Interceptors -> Pipes ->
// Controller), so req.user is only populated once JwtAuthGuard/TenantGuard have already
// resolved the caller — a guard-rejected request (401/403/429) never reaches this
// interceptor, same limitation the backend's RequestInterceptor already has. correlationId
// itself is guaranteed regardless (CorrelationMiddleware runs pre-Guards and stamps its own
// span attribute directly — see correlation.middleware.ts); only tenant.id/actor.* depend on
// this interceptor having run.
@Injectable()
export class RequestInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>();

    const correlationId = req.headers['x-correlation-id'] as string;
    const tenantId = req.user?.tenantId;
    const actorId = req.user?.sub;
    const actorType: 'STAFF' | 'CUSTOMER' | undefined = req.user
      ? req.user.role === 'CUSTOMER'
        ? 'CUSTOMER'
        : 'STAFF'
      : undefined;
    const actorRole = req.user?.role;
    const actor = actorId && actorType && actorRole ? { actorId, actorType, actorRole } : undefined;

    if (tenantId) {
      trace.getActiveSpan()?.setAttributes({
        'tenant.id': tenantId,
        ...(actorId ? { 'user.id': actorId } : {}),
      });
    }

    return new Observable((subscriber) => {
      runWithRequestContext(
        correlationId,
        () => {
          next.handle().subscribe(subscriber);
        },
        tenantId,
        actor,
      );
    });
  }
}
