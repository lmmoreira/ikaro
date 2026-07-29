import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { ActorRole } from '@ikaro/types';

@Injectable()
export class StaffOrManagerRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const actorRole = req.headers['x-actor-role'] as ActorRole | undefined;

    if (actorRole !== 'MANAGER' && actorRole !== 'STAFF') {
      throw throwProblemDetail(HttpStatus.FORBIDDEN, undefined, 'MANAGER or STAFF role required');
    }
    return true;
  }
}
