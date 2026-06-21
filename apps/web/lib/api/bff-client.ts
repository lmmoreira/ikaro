import axios from 'axios';
import { ApiError, AuthError, ForbiddenError } from './errors';

let _token = '';
let _tenantSlug = '';
let _tenantId = '';

export function configureBffClient(cfg: {
  token: string;
  tenantSlug: string;
  tenantId: string;
}): void {
  _token = cfg.token;
  _tenantSlug = cfg.tenantSlug;
  _tenantId = cfg.tenantId;
}

export function getTenantId(): string {
  return _tenantId;
}

export const bffClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_BFF_URL,
});

bffClient.interceptors.request.use((config) => {
  if (_token) config.headers['Authorization'] = `Bearer ${_token}`;
  if (_tenantSlug) config.headers['X-Tenant-Slug'] = _tenantSlug;
  return config;
});

bffClient.interceptors.response.use(
  (res) => res,
  (err: unknown) => {
    if (!axios.isAxiosError(err)) return Promise.reject(err);
    const status = err.response?.status ?? 0;
    const data = err.response?.data as { detail?: string } | undefined;
    const clientDetail =
      status >= 400 && status < 500 ? (data?.detail ?? err.message) : err.message;
    if (status === 401) return Promise.reject(new AuthError(clientDetail));
    if (status === 403) return Promise.reject(new ForbiddenError(clientDetail));
    return Promise.reject(
      new ApiError(status, status >= 500 ? 'Internal server error' : clientDetail),
    );
  },
);
