import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';

// Guards execute before interceptors in NestJS, so RequestContext (AsyncLocalStorage)
// is not populated yet. Read X-Actor-Role directly from the request header.
//
// TRUST BOUNDARY: The backend trusts X-Actor-Role because it is reachable only from
// the BFF over a private internal network (Cloud Run VPC / service-to-service). If the
// backend were ever exposed publicly, this header could be forged. Production hardening
// (mTLS or a shared-secret header) is tracked in plan/M16-CICD-DEPLOY-HARDENING.md § M16-S11.
@Injectable()
export class ManagerRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const actorRole = req.headers['x-actor-role'];

    if (actorRole !== 'MANAGER') {
      throw throwProblemDetail(HttpStatus.FORBIDDEN, undefined, 'MANAGER role required');
    }
    return true;
  }
}
