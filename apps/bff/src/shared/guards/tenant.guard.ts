import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthErrorCode } from '@ikaro/types';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { throwProblemDetail } from '../http/problem-detail';

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as CurrentUserPayload | undefined;
    if (!user) return true;

    const tenantSlug = req.headers['x-tenant-slug'] as string | undefined;
    if (!tenantSlug) return true;

    if (tenantSlug !== user.tenantSlug) {
      throwProblemDetail(
        HttpStatus.FORBIDDEN,
        AuthErrorCode.TENANT_MISMATCH,
        'X-Tenant-Slug does not match the tenant in your JWT',
      );
    }

    return true;
  }
}
