import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ProblemDetail } from '@ikaro/types';
import { ITenantSettingsPort, TENANT_SETTINGS_PORT } from '../ports/tenant-settings.port';
import type { TenantSettingsData } from '../value-objects/tenant-settings-data';
import { runWithRequestContext } from './request-context';

@Injectable()
export class RequestInterceptor implements NestInterceptor {
  constructor(@Inject(TENANT_SETTINGS_PORT) private readonly settingsPort: ITenantSettingsPort) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      path: string;
    }>();

    if (
      req.path?.startsWith('/health') ||
      req.path?.startsWith('/internal') ||
      req.path?.startsWith('/cron')
    ) {
      return next.handle();
    }

    const tenantId =
      typeof req.headers['x-tenant-id'] === 'string' ? req.headers['x-tenant-id'] : undefined;
    if (!tenantId) {
      const body: ProblemDetail = {
        type: 'about:blank',
        title: 'Missing Tenant Header',
        status: HttpStatus.BAD_REQUEST,
        detail: 'X-Tenant-ID header is required on all requests',
      };
      throw new HttpException(body, HttpStatus.BAD_REQUEST);
    }

    let settings: TenantSettingsData;
    try {
      settings = await this.settingsPort.getSettings(tenantId);
    } catch {
      const body: ProblemDetail = {
        type: 'about:blank',
        title: 'Tenant Not Found',
        status: HttpStatus.NOT_FOUND,
        detail: `Tenant not found: ${tenantId}`,
      };
      throw new HttpException(body, HttpStatus.NOT_FOUND);
    }

    // CorrelationMiddleware (runs before Guards, M17-S31) always sets this by the time any
    // Interceptor runs — no fallback generation needed here anymore.
    const correlationId = req.headers['x-correlation-id'] as string;

    const actorId =
      typeof req.headers['x-actor-id'] === 'string' ? req.headers['x-actor-id'] : undefined;
    const rawActorType =
      typeof req.headers['x-actor-type'] === 'string' ? req.headers['x-actor-type'] : undefined;
    const actorType: 'STAFF' | 'CUSTOMER' | undefined =
      rawActorType === 'STAFF' || rawActorType === 'CUSTOMER' ? rawActorType : undefined;
    const actorRole =
      typeof req.headers['x-actor-role'] === 'string' ? req.headers['x-actor-role'] : undefined;
    const actor = actorId && actorType && actorRole ? { actorId, actorType, actorRole } : undefined;

    // Wrap the entire request observable in AsyncLocalStorage context so that
    // RequestContext fields are available anywhere in the call chain.
    return new Observable((subscriber) => {
      runWithRequestContext(
        tenantId,
        correlationId,
        settings,
        () => {
          next.handle().subscribe(subscriber);
        },
        actor,
      );
    });
  }
}
