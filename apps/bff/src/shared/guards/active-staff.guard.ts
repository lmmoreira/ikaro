import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AxiosError } from 'axios';
import { Request } from 'express';
import { AuthErrorCode, BffErrorCode, StaffErrorCode } from '@ikaro/types';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { getCurrentUser } from '../decorators/current-user.decorator';
import { BackendInternalClient } from '../http/backend-internal-client';
import { throwProblemDetail } from '../http/problem-detail';
import { StaffActiveResponse } from '../types/backend-responses';

@Injectable()
export class ActiveStaffGuard implements CanActivate {
  // ActiveStaffGuard is singleton-scoped; BackendHttpService is REQUEST-scoped.
  // NestJS cannot inject a REQUEST-scoped service into a singleton.
  // BackendInternalClient takes the request as an argument, so it has no scope conflict.
  constructor(
    private readonly backend: BackendInternalClient,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = getCurrentUser(req);

    if (!user?.sub || user.role === 'CUSTOMER') return true;

    try {
      const data = await this.fetchStaffStatus(req);

      if (!data.isActive) {
        throw throwProblemDetail(
          HttpStatus.FORBIDDEN,
          StaffErrorCode.DEACTIVATED,
          'Your account has been deactivated',
        );
      }

      return true;
    } catch (err) {
      this.rethrowStatusCheckError(err);
    }
  }

  // GET /staff/me/status derives the target from the actor headers below (never a URL param),
  // so a STAFF (non-manager) actor can self-check here. GET /staff/:id is manager-only
  // (staff-list lookups) and would always 403 a plain STAFF actor — the cause of a real bug
  // found during TD23 Story 11 discovery (every STAFF-role request used to 503 via the generic
  // branch below).
  private fetchStaffStatus(req: Request): Promise<StaffActiveResponse> {
    return this.backend.get<StaffActiveResponse>('/staff/me/status', req);
  }

  private rethrowStatusCheckError(err: unknown): never {
    if (err instanceof HttpException) throw err;
    if (err instanceof AxiosError) {
      if (!err.response) {
        // Genuine network-level failure (timeout, connection refused) — no response at all.
        throw throwProblemDetail(
          HttpStatus.SERVICE_UNAVAILABLE,
          BffErrorCode.UPSTREAM_UNAVAILABLE,
          'Could not verify staff account status',
        );
      }
      if (err.response.status === HttpStatus.NOT_FOUND) {
        // No hard-delete path exists anywhere in apps/backend/src/contexts/staff/ — a 404 on
        // the caller's own staffId can only mean a stale/mismatched JWT. Fail closed, not open:
        // there is no benign case where "allow the request through" is the safe default here
        // (TD23 Story 11 discovery).
        throw throwProblemDetail(
          HttpStatus.UNAUTHORIZED,
          AuthErrorCode.UNAUTHORIZED,
          'Session is no longer valid',
        );
      }
      // Backend responded with some other error — preserve its real code/detail, mirroring
      // BackendHttpService.call()'s passthrough as closely as this guard's DI-scope constraint
      // allows (docs/ANTI_PATTERNS.md's ActiveStaffGuard row).
      throw new HttpException(err.response.data as object, err.response.status);
    }
    throw err;
  }
}
