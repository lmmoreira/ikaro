import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { ActorRole } from '@ikaro/types/protocol/actor';

@Injectable()
export class AnyAuthenticatedRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const actorRole = req.headers['x-actor-role'] as ActorRole | undefined;

    if (actorRole !== 'CUSTOMER' && actorRole !== 'STAFF' && actorRole !== 'MANAGER') {
      throw throwProblemDetail(HttpStatus.FORBIDDEN, undefined, 'Authenticated role required');
    }
    return true;
  }
}
