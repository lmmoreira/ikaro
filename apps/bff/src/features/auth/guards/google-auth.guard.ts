import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { encodeOAuthState } from '../oauth-state';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext): object {
    const req = context.switchToHttp().getRequest<Request>();
    const tenantSlug = req.query['tenantSlug'] as string | undefined;
    if (req.query['type'] === 'staff') {
      return { state: encodeOAuthState('staff', tenantSlug) };
    }
    return { state: encodeOAuthState('customer', tenantSlug) };
  }
}
