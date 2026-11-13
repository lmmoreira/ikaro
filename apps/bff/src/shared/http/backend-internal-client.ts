import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { firstValueFrom, type Observable } from 'rxjs';
import { buildBackendHeaders } from './backend-headers';

const BACKEND_INTERNAL_TIMEOUT_MS = 5_000;

/** The one `HttpService` call the client makes: a narrow shape a spec can implement without a cast. */
export interface BackendGetClient {
  get<T>(
    url: string,
    config: { headers: Record<string, string>; timeout: number },
  ): Observable<{ data: T }>;
}

/** The two config reads the client makes. */
export interface BackendClientConfig {
  getOrThrow(key: 'BACKEND_INTERNAL_URL' | 'INTERNAL_API_KEY'): string;
}

/**
 * The backend caller for a **singleton** (a global guard). `BackendHttpService` is request-scoped:
 * it holds the incoming request to forward its correlation and actor headers, and Nest cannot inject
 * a request-scoped provider into a singleton. This client takes the request as an argument instead
 * and builds the same headers with `buildBackendHeaders(req)` plus the internal key. It throws the
 * raw transport error; each caller decides what a failure means.
 */
@Injectable()
export class BackendInternalClient {
  private readonly backendUrl: string;

  constructor(
    // The concrete classes are the DI tokens (the narrow interfaces are erased at runtime).
    @Inject(HttpService) private readonly http: BackendGetClient,
    @Inject(ConfigService) private readonly config: BackendClientConfig,
  ) {
    this.backendUrl = this.config.getOrThrow('BACKEND_INTERNAL_URL');
  }

  async get<T>(path: string, req: Request): Promise<T> {
    const { data } = await firstValueFrom(
      this.http.get<T>(`${this.backendUrl}${path}`, {
        headers: {
          ...buildBackendHeaders(req),
          'X-Internal-Key': this.config.getOrThrow('INTERNAL_API_KEY'),
        },
        timeout: BACKEND_INTERNAL_TIMEOUT_MS,
      }),
    );
    return data;
  }
}
