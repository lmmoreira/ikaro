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
    let actorType: 'STAFF' | 'CUSTOMER' | undefined;
    if (req.user) {
      actorType = req.user.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF';
    }
    const actorRole = req.user?.role;
    const actor = actorId && actorType && actorRole ? { actorId, actorType, actorRole } : undefined;

    if (tenantId) {
      trace.getActiveSpan()?.setAttributes({
        'tenant.id': tenantId,
        // actor?.actorId (not the raw actorId var) for consistency with the backend's
        // interceptor — here they're always equivalent (actor and actorId both derive from the
        // same req.user presence check), but this keeps both interceptors on the same pattern.
        ...(actor?.actorId ? { 'user.id': actor.actorId } : {}),
      });
    }

    // Returning the inner Subscription as this executor's teardown logic wires outer
    // unsubscription (e.g. a client aborting the request) through to it — otherwise it would
    // keep running after teardown.
    return new Observable((subscriber) => {
      return runWithRequestContext(
        correlationId,
        () => next.handle().subscribe(subscriber),
        tenantId,
        actor,
      );
    });
  }
}
