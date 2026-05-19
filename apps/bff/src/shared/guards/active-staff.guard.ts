import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Reflector } from '@nestjs/core';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

interface StaffActiveResponse {
  isActive: boolean;
}

@Injectable()
export class ActiveStaffGuard implements CanActivate {
  private readonly backendUrl = process.env['BACKEND_INTERNAL_URL'] ?? '';

  constructor(
    private readonly http: HttpService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as CurrentUserPayload | undefined;

    if (!user?.sub || user.role === 'CUSTOMER') return true;

    const tenantId = user.tenantId;
    const staffId = user.sub;
    // CorrelationInterceptor runs after guards; omit header when not yet set
    // so the backend generates its own correlation id for this sub-request.
    const correlationId = req.headers['x-correlation-id'] as string | undefined;
    const extraHeaders: Record<string, string> = correlationId
      ? { 'X-Correlation-ID': correlationId }
      : {};

    try {
      const { data } = await firstValueFrom(
        this.http.get<StaffActiveResponse>(`${this.backendUrl}/staff/${staffId}`, {
          headers: {
            'X-Tenant-ID': tenantId,
            'X-Actor-ID': staffId,
            'X-Actor-Type': 'STAFF',
            'X-Actor-Role': user.role,
            ...extraHeaders,
          },
          timeout: 5_000,
        }),
      );

      if (!data.isActive) {
        throw new HttpException(
          {
            type: 'about:blank',
            title: 'Forbidden',
            status: HttpStatus.FORBIDDEN,
            detail: 'Your account has been deactivated',
          },
          HttpStatus.FORBIDDEN,
        );
      }

      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err instanceof AxiosError) {
        const status = err.response?.status;
        if (status === 404) return true;
        throw new HttpException(
          {
            type: 'about:blank',
            title: 'Service Unavailable',
            status: HttpStatus.SERVICE_UNAVAILABLE,
            detail: 'Could not verify staff account status',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      throw err;
    }
  }
}
