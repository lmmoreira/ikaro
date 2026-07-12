import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';

@Injectable()
export class CustomerRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const actorRole = req.headers['x-actor-role'];

    if (actorRole !== 'CUSTOMER') {
      throw throwProblemDetail(HttpStatus.FORBIDDEN, undefined, 'CUSTOMER role required');
    }
    return true;
  }
}
