import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export interface CurrentUserPayload {
  sub: string;
  tenantId: string;
  tenantSlug: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentUserPayload | undefined => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: CurrentUserPayload }>();
    return request.user;
  },
);
