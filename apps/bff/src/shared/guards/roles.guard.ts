import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthErrorCode } from '@ikaro/types';
import { getCurrentUser } from '../decorators/current-user.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { throwProblemDetail } from '../http/problem-detail';
import { JwtRole } from '../../features/auth/jwt-issuer.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<JwtRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = getCurrentUser(req);

    if (!user || !requiredRoles.includes(user.role)) {
      throw throwProblemDetail(
        HttpStatus.FORBIDDEN,
        AuthErrorCode.FORBIDDEN,
        `One of the following roles is required: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
