import { HttpService } from '@nestjs/axios';
import { HttpException, Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AxiosError, AxiosResponse } from 'axios';
import { Request } from 'express';
import { Observable, firstValueFrom } from 'rxjs';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

@Injectable({ scope: Scope.REQUEST })
export class BackendHttpService {
  private readonly baseUrl = process.env['BACKEND_INTERNAL_URL'] ?? '';

  constructor(
    private readonly http: HttpService,
    @Inject(REQUEST) private readonly req: Request,
  ) {}

  async get<T>(path: string, params?: Record<string, unknown>): Promise<T> {
    return this.call(
      this.http.get<T>(`${this.baseUrl}${path}`, {
        headers: this.headers(),
        params,
        timeout: 10_000,
      }),
    );
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.call(
      this.http.post<T>(`${this.baseUrl}${path}`, body, {
        headers: this.headers(),
        timeout: 10_000,
      }),
    );
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    return this.call(
      this.http.patch<T>(`${this.baseUrl}${path}`, body, {
        headers: this.headers(),
        timeout: 10_000,
      }),
    );
  }

  async delete<T>(path: string): Promise<T> {
    return this.call(
      this.http.delete<T>(`${this.baseUrl}${path}`, {
        headers: this.headers(),
        timeout: 10_000,
      }),
    );
  }

  private async call<T>(observable: Observable<AxiosResponse<T>>): Promise<T> {
    try {
      const { data } = await firstValueFrom(observable);
      return data;
    } catch (err) {
      if (err instanceof AxiosError && err.response) {
        throw new HttpException(err.response.data as object, err.response.status);
      }
      throw err;
    }
  }

  private headers(): Record<string, string> {
    const user = this.req.user as CurrentUserPayload | undefined;
    const correlationId = this.req.headers['x-correlation-id'] as string | undefined;
    // Empty strings are intentional: X-Tenant-ID is '' on guest routes (no JWT),
    // X-Correlation-ID is always set by CorrelationInterceptor before any controller
    // runs, so it is never empty in practice. The backend TenantInterceptor handles
    // the absent-tenant case for public endpoints.
    const base: Record<string, string> = {
      'X-Tenant-ID': user?.tenantId ?? '',
      'X-Correlation-ID': correlationId ?? '',
    };

    // Only add actor headers when the request carries a verified JWT user.
    // During the OAuth callback req.user is a GoogleProfile (no sub/role),
    // so we guard on user.sub to avoid sending undefined actor headers.
    if (user?.sub) {
      base['X-Actor-ID'] = user.sub;
      base['X-Actor-Type'] = user.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF';
      base['X-Actor-Role'] = user.role;
    }

    return base;
  }
}
