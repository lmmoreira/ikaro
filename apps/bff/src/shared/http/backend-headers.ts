import { Request } from 'express';
import { CurrentUserPayload } from '../decorators/current-user.decorator';

export function buildBackendHeaders(req: Request): Record<string, string> {
  const user = req.user as CurrentUserPayload | undefined;
  const correlationId = req.headers['x-correlation-id'] as string | undefined;

  // CorrelationMiddleware (runs before Guards, M17-S31) guarantees this is always set by
  // the time any code that could call buildBackendHeaders runs; the fallback is defensive
  // only — omitted (not '') so the backend falls back to generating its own UUID rather
  // than forwarding an empty header.
  const headers: Record<string, string> = {
    'X-Tenant-ID': user?.tenantId ?? '',
    ...(correlationId ? { 'X-Correlation-ID': correlationId } : {}),
  };

  if (user?.sub) {
    headers['X-Actor-ID'] = user.sub;
    headers['X-Actor-Type'] = user.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF';
    headers['X-Actor-Role'] = user.role;
  }

  return headers;
}
