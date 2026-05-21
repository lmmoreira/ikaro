import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class StaffOrManagerRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const actorRole = req.headers['x-actor-role'];

    if (actorRole !== 'MANAGER' && actorRole !== 'STAFF') {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Forbidden',
          status: HttpStatus.FORBIDDEN,
          detail: 'MANAGER or STAFF role required',
        },
        HttpStatus.FORBIDDEN,
      );
    }
    return true;
  }
}
