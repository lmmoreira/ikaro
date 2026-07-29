import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { defaultTracingPort, ITracingPort } from '@ikaro/observability';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { getCurrentUser } from '../decorators/current-user.decorator';
import { enrichRequestContext } from './request-context';

// Runs after Guards (NestJS pipeline: Middleware -> Guards -> Interceptors -> Pipes ->
// Controller), so req.user is only populated once JwtAuthGuard/TenantGuard have already
// resolved the caller — a guard-rejected request (401/403/429) never reaches this
// interceptor, same limitation the backend's RequestInterceptor already has. correlationId
// itself is guaranteed regardless: CorrelationMiddleware runs pre-Guards, stamps its own span
// attribute, and already established the RequestContext AsyncLocalStorage store (see
// correlation.middleware.ts / request-context.ts) — this interceptor only enriches that
// existing store with tenantId/actor once known, it doesn't create a new context boundary, so
// there's no Observable-wrapping/subscription-teardown concern here.
@Injectable()
export class RequestInterceptor implements NestInterceptor {
  // @Optional() so Nest's DI container doesn't throw trying to resolve an interface token when
  // no provider is bound for it — falls through to the default, same pattern as AppLogger's
  // vendorFormatter param (packages/observability/src/app-logger.ts).
  constructor(@Optional() private readonly tracingPort: ITracingPort = defaultTracingPort) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const user = getCurrentUser(req);

    const tenantId = user?.tenantId;
    const actorId = user?.sub;
    let actorType: 'STAFF' | 'CUSTOMER' | undefined;
    if (user) {
      actorType = user.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF';
    }
    const actorRole = user?.role;
    const actor = actorId && actorType && actorRole ? { actorId, actorType, actorRole } : undefined;

    if (tenantId) {
      enrichRequestContext(tenantId, actor);
      this.tracingPort.setActiveSpanAttributes({
        'tenant.id': tenantId,
        ...(actor?.actorId ? { 'user.id': actor.actorId } : {}),
      });
    }

    return next.handle();
  }
}
