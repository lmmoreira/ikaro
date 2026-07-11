import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as crypto from 'node:crypto';
import { ProblemDetail } from '@ikaro/types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class InternalApiGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined> }>();
    const incomingKey = req.headers['x-internal-key'];

    const storedKey = this.config.getOrThrow<string>('INTERNAL_API_KEY');

    // Hash both sides to normalise length before timingSafeEqual (prevents key-length leaks)
    const storedHash = crypto.createHash('sha256').update(storedKey).digest();
    const incomingHash = crypto
      .createHash('sha256')
      .update(incomingKey ?? '')
      .digest();

    if (!incomingKey || !crypto.timingSafeEqual(storedHash, incomingHash)) {
      const body: ProblemDetail = {
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        detail: 'Missing or invalid X-Internal-Key header',
      };
      throw new UnauthorizedException(body);
    }

    return true;
  }
}
