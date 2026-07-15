import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Inject, Injectable, Scope } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REQUEST } from '@nestjs/core';
import { BffErrorCode } from '@ikaro/types';
import { AxiosError, AxiosResponse } from 'axios';
import { Request } from 'express';
import { Observable, firstValueFrom } from 'rxjs';
import { buildBackendHeaders } from './backend-headers';
import { throwProblemDetail } from './problem-detail';

@Injectable({ scope: Scope.REQUEST })
export class BackendHttpService {
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    @Inject(REQUEST) private readonly req: Request,
  ) {
    this.baseUrl = this.config.getOrThrow<string>('BACKEND_INTERNAL_URL');
  }

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

  async getForPublic<T>(
    path: string,
    tenantId: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    return this.call(
      this.http.get<T>(`${this.baseUrl}${path}`, {
        headers: {
          'X-Tenant-ID': tenantId,
          'X-Internal-Key': this.config.getOrThrow('INTERNAL_API_KEY'),
        },
        params,
        timeout: 10_000,
      }),
    );
  }

  async postForPublic<T>(path: string, body: unknown, tenantId: string): Promise<T> {
    return this.call(
      this.http.post<T>(`${this.baseUrl}${path}`, body, {
        headers: {
          'X-Tenant-ID': tenantId,
          'X-Internal-Key': this.config.getOrThrow('INTERNAL_API_KEY'),
        },
        timeout: 10_000,
      }),
    );
  }

  async patchForPublic<T>(path: string, body: unknown, tenantId: string): Promise<T> {
    return this.call(
      this.http.patch<T>(`${this.baseUrl}${path}`, body, {
        headers: {
          'X-Tenant-ID': tenantId,
          'X-Internal-Key': this.config.getOrThrow('INTERNAL_API_KEY'),
        },
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
      if (err instanceof AxiosError) {
        throw throwProblemDetail(
          HttpStatus.SERVICE_UNAVAILABLE,
          BffErrorCode.UPSTREAM_UNAVAILABLE,
          'Backend service unavailable',
        );
      }
      throw err;
    }
  }

  private headers(): Record<string, string> {
    return {
      ...buildBackendHeaders(this.req),
      'X-Internal-Key': this.config.getOrThrow('INTERNAL_API_KEY'),
    };
  }
}
