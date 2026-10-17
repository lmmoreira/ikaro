import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { ActorRole } from '@ikaro/types/protocol/actor';

// Guards execute before interceptors in NestJS, so RequestContext (AsyncLocalStorage)
// is not populated yet. Read X-Actor-Role directly from the request header.
//
// TRUST BOUNDARY: The backend trusts X-Actor-Role because it is reachable only from
// the BFF over a private internal network (Cloud Run VPC / service-to-service). If the
// backend were ever exposed publicly, this header could be forged. That is hardened by
// internal-only ingress plus the shared-secret X-Internal-Key check in InternalApiGuard.
@Injectable()
export class ManagerRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const actorRole = req.headers['x-actor-role'] as ActorRole | undefined;

    if (actorRole !== 'MANAGER') {
      throw throwProblemDetail(HttpStatus.FORBIDDEN, undefined, 'MANAGER role required');
    }
    return true;
  }
}
