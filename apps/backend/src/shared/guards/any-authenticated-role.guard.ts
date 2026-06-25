import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class AnyAuthenticatedRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const actorRole = req.headers['x-actor-role'];

    if (actorRole !== 'CUSTOMER' && actorRole !== 'STAFF' && actorRole !== 'MANAGER') {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Forbidden',
          status: HttpStatus.FORBIDDEN,
          detail: 'Authenticated role required',
        },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
