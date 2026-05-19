import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { buildBackendHeaders } from '../http/backend-headers';
import { StaffActiveResponse } from '../types/backend-responses';

@Injectable()
export class ActiveStaffGuard implements CanActivate {
  private readonly backendUrl: string;

  // ActiveStaffGuard is singleton-scoped; BackendHttpService is REQUEST-scoped.
  // NestJS cannot inject a REQUEST-scoped service into a singleton.
  // buildBackendHeaders(req) gives us the same header logic without the scope conflict.
  constructor(
    private readonly http: HttpService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {
    this.backendUrl = this.config.getOrThrow<string>('BACKEND_INTERNAL_URL');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = req.user as CurrentUserPayload | undefined;

    if (!user?.sub || user.role === 'CUSTOMER') return true;

    try {
      const { data } = await firstValueFrom(
        this.http.get<StaffActiveResponse>(`${this.backendUrl}/staff/${user.sub}`, {
          headers: buildBackendHeaders(req),
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
