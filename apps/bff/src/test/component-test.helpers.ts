import { Observable, of, throwError } from 'rxjs';
import { AxiosResponse } from 'axios';
import * as dotenv from 'dotenv';
import * as path from 'node:path';
import supertest from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { JwtService } from '@nestjs/jwt';
import { AppModule } from '../app.module';
import { applySecurityHeaders } from '../shared/http/security-headers';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { MockBackendHttpService } from './backend-http.mock';

export type { MockBackendHttpService };

export const BACKEND_URL = 'https://backend-test:3001';

export const TENANT_ID = '10000000-0000-4000-8000-000000000001';
export const TENANT_ID_2 = '10000000-0000-4000-8000-000000000002';
export const STAFF_ID = '30000000-0000-4000-8000-000000000001';
export const STAFF_ID_2 = '30000000-0000-4000-8000-000000000002';
export const CUSTOMER_ID = '20000000-0000-4000-8000-000000000001';
export const GOOGLE_OAUTH_ID = 'google-sub-test-123';

// HttpService mock — used by ActiveStaffGuard (which uses HttpService directly, not BackendHttpService)
export type MockHttpService = jest.Mocked<Pick<HttpService, 'get' | 'post' | 'patch' | 'delete'>>;

export function makeObservableResponse<T>(data: T): Observable<AxiosResponse<T>> {
  return of({ data, status: 200, statusText: 'OK', headers: {}, config: {} as never });
}

export function makeObservableError(error: unknown): Observable<never> {
  return throwError(() => error);
}

export async function createTestApp(): Promise<{
  app: INestApplication;
  jwtService: JwtService;
  // httpService is used directly by ActiveStaffGuard — returns Observables
  httpService: MockHttpService;
  // backendHttpService is used by controllers via BackendHttpService — returns Promises
  backendHttpService: MockBackendHttpService;
  // Call in afterAll to re-apply .env values (single source of truth)
  restoreEnv: () => void;
}> {
  const httpService: MockHttpService = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  };

  const backendHttpService: MockBackendHttpService = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    getForPublic: jest.fn(),
    postForPublic: jest.fn(),
    patchForPublic: jest.fn(),
  };

  const module: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    // ActiveStaffGuard uses HttpService directly (singleton, AppModule scope).
    // Overriding HttpService in the root module reaches the guard correctly.
    .overrideProvider(HttpService)
    .useValue(httpService)
    // BackendHttpService lives in BackendHttpModule scope. Overriding it directly
    // sidesteps the module-scoped HttpService deduplication issue in test modules.
    // BackendHttpService is REQUEST-scoped but useValue makes it a shared singleton
    // in tests — safe because jest.resetAllMocks() clears state between tests.
    .overrideProvider(BackendHttpService)
    .useValue(backendHttpService)
    .compile();

  const app = module.createNestApplication();
  applySecurityHeaders(app);
  app.setGlobalPrefix('v1');
  await app.init();

  const restoreEnv = (): void => {
    dotenv.config({ path: path.join(process.cwd(), '.env'), override: true, quiet: true });
  };

  return {
    app,
    jwtService: module.get(JwtService),
    httpService,
    backendHttpService,
    restoreEnv,
  };
}

export function makeManagerJwt(
  jwtService: JwtService,
  overrides?: Record<string, unknown>,
): string {
  return jwtService.sign({
    sub: STAFF_ID,
    tenantId: TENANT_ID,
    tenantSlug: 'lavacar-bh',
    role: 'MANAGER',
    ...overrides,
  });
}

export function makeStaffJwt(jwtService: JwtService): string {
  return makeManagerJwt(jwtService, { role: 'STAFF' });
}

export function makeCustomerJwt(
  jwtService: JwtService,
  overrides?: Record<string, unknown>,
): string {
  return makeManagerJwt(jwtService, { sub: CUSTOMER_ID, role: 'CUSTOMER', ...overrides });
}

// Sets up the ActiveStaffGuard's HttpService mock for one request.
// Must be called before any request that carries a MANAGER or STAFF JWT,
// because the guard fires before the controller.
export function setupActiveGuardMock(httpService: MockHttpService, isActive = true): void {
  httpService.get.mockReturnValueOnce(makeObservableResponse({ isActive }));
}

export { supertest as request };
