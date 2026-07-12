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
import { AuthErrorCode, BffErrorCode, StaffErrorCode } from '@ikaro/types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { CurrentUserPayload } from '../decorators/current-user.decorator';
import { buildBackendHeaders } from '../http/backend-headers';
import { throwProblemDetail } from '../http/problem-detail';
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
      // GET /staff/me/status derives the target from the actor headers below (never a URL
      // param), so a STAFF (non-manager) actor can self-check here. GET /staff/:id is
      // manager-only (staff-list lookups) and would always 403 a plain STAFF actor — the
      // cause of a real bug found during TD23 Story 11 discovery (every STAFF-role request
      // used to 503 via the generic branch below).
      const { data } = await firstValueFrom(
        this.http.get<StaffActiveResponse>(`${this.backendUrl}/staff/me/status`, {
          headers: buildBackendHeaders(req),
          timeout: 5_000,
        }),
      );

      if (!data.isActive) {
        throwProblemDetail(
          HttpStatus.FORBIDDEN,
          StaffErrorCode.DEACTIVATED,
          'Your account has been deactivated',
        );
      }

      return true;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err instanceof AxiosError) {
        if (!err.response) {
          // Genuine network-level failure (timeout, connection refused) — no response at all.
          throwProblemDetail(
            HttpStatus.SERVICE_UNAVAILABLE,
            BffErrorCode.UPSTREAM_UNAVAILABLE,
            'Could not verify staff account status',
          );
        }
        if (err.response.status === HttpStatus.NOT_FOUND) {
          // No hard-delete path exists anywhere in apps/backend/src/contexts/staff/ — a 404 on
          // the caller's own staffId can only mean a stale/mismatched JWT. Fail closed, not
          // open: there is no benign case where "allow the request through" is the safe
          // default here (TD23 Story 11 discovery).
          throwProblemDetail(
            HttpStatus.UNAUTHORIZED,
            AuthErrorCode.UNAUTHORIZED,
            'Session is no longer valid',
          );
        }
        // Backend responded with some other error — preserve its real code/detail, mirroring
        // BackendHttpService.call()'s passthrough as closely as this guard's DI-scope
        // constraint allows (docs/ANTI_PATTERNS.md's ActiveStaffGuard row).
        throw new HttpException(err.response.data as object, err.response.status);
      }
      throw err;
    }
  }
}
