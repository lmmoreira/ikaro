import { ArgumentsHost, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { AuthErrorCode, ProblemDetail } from '@ikaro/types';
import type { BaseAppLogger } from '@ikaro/observability';

type MinimalRequest = {
  path: string;
  method: string;
  headers: Record<string, string | string[] | undefined>;
};
interface MinimalResponse {
  set(field: string, value: string): unknown;
  status(code: number): { json(body: unknown): void };
}

// Shared by apps/backend and apps/bff (TD23-S18) — logs `error.code` on every non-2xx
// HttpException and converts any truly-unhandled error into an RFC 9457 ProblemDetail
// instead of leaking each framework's own default (non-compliant) 500 shape.
//
// Must be an ExceptionFilter (@Catch()), not an Interceptor. NestJS's request pipeline is
// Middleware -> Guards -> Interceptors -> Pipes -> Controller — Guards run *before* any
// Interceptor's intercept() is invoked, so an interceptor-based catchError never sees
// exceptions thrown by a Guard (JwtAuthGuard, RolesGuard, etc. — a very common error
// category). Exception filters are the actual terminal catch-all for the whole pipeline,
// which is what "every error response" requires. Each app supplies its own AppLogger
// subclass via the constructor; the logic itself must not be copy-pasted per app — that
// duplication is what SonarCloud's new-code-duplication gate caught the first time this
// was written twice as an interceptor.
export abstract class BaseErrorFilter implements ExceptionFilter {
  protected constructor(private readonly logger: BaseAppLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<MinimalRequest>();
    const res = ctx.getResponse<MinimalResponse>();
    const correlationId = this.getCorrelationId(req);

    // RFC 9457 — every non-2xx response is application/problem+json, not the framework's
    // default application/json. This is the single terminal point for every error response
    // in the app (see the class comment on why this must be a filter, not an interceptor),
    // so it's also the only place that needs to set this.
    res.set('Content-Type', 'application/problem+json');
    if (correlationId) res.set('X-Correlation-ID', correlationId);

    if (exception instanceof HttpException) {
      this.logErrorCode(exception, req);
      const body = this.attachCorrelationId(exception.getResponse(), correlationId);
      res.status(exception.getStatus()).json(body);
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
      {
        code: AuthErrorCode.INTERNAL_ERROR,
        path: req.path,
        method: req.method,
      },
    );

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const problem: ProblemDetail = {
      type: 'about:blank',
      title: 'Internal Server Error',
      status,
      code: AuthErrorCode.INTERNAL_ERROR,
      detail: 'An unexpected error occurred',
      instance: req.path,
      ...(correlationId ? { correlationId } : {}),
    };
    res.status(status).json(problem);
  }

  // correlationId is generated in middleware (before Guards run — see CorrelationMiddleware
  // in each app) precisely so it's present here even when a Guard rejected the request before
  // any Interceptor got a chance to run.
  private getCorrelationId(req: MinimalRequest): string | undefined {
    const value = req.headers['x-correlation-id'];
    return typeof value === 'string' ? value : undefined;
  }

  private attachCorrelationId(body: unknown, correlationId: string | undefined): unknown {
    if (!correlationId || typeof body !== 'object' || body === null) return body;
    return { ...body, correlationId };
  }

  private logErrorCode(exception: HttpException, req: MinimalRequest): void {
    const body = exception.getResponse();
    const code =
      typeof body === 'object' && body !== null ? (body as ProblemDetail).code : undefined;
    if (!code) return;

    const logContext = { code, path: req.path, method: req.method };
    if (exception.getStatus() >= 500) {
      this.logger.error('Error response', undefined, logContext);
    } else {
      this.logger.warn('Error response', logContext);
    }
  }
}
