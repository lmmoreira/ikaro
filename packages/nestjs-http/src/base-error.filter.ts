import { ArgumentsHost, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { AuthErrorCode, buildProblemDetail, ProblemDetail } from '@ikaro/types';
import { defaultTracingPort, type BaseAppLogger, type ITracingPort } from '@ikaro/observability';

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
  // tracingPort defaults to defaultTracingPort (packages/observability's centralized singleton,
  // same convention as AppLogger) rather than going through NestJS DI — this class is never
  // resolved directly by Nest's container (each app's concrete ErrorFilter has its own
  // no-args constructor and calls super() itself), so a plain default parameter is the correct
  // wiring, not @Optional(). TD23-S18 / M17-S33 security-review follow-up (2026-07-21):
  // error.code was already attached to every non-2xx structured log line; this attaches the
  // same code as a span attribute so it shows up in Cloud Trace too.
  protected constructor(
    private readonly logger: BaseAppLogger,
    private readonly tracingPort: ITracingPort = defaultTracingPort,
  ) {}

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
      const problemBody = this.toProblemDetail(exception);
      const body = this.attachCorrelationId(problemBody, correlationId);
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
    this.tracingPort.setActiveSpanAttributes({ 'error.code': AuthErrorCode.INTERNAL_ERROR });

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

  // Not every HttpException in the app was constructed via throwProblemDetail()/
  // buildProblemDetail() — Nest's own framework-level exceptions (e.g. the router's default
  // 404 for a route with no matching controller) carry a body shaped
  // { statusCode, message, error }, not the RFC 9457 { type, title, status, ... } envelope.
  // Passing that through unchanged while also stamping Content-Type: application/problem+json
  // on it would mislabel a non-compliant body as compliant — normalize it into a real
  // ProblemDetail here instead, so every response leaving this filter actually matches its
  // own declared Content-Type.
  private toProblemDetail(exception: HttpException): ProblemDetail {
    const rawBody = exception.getResponse();
    if (this.isProblemDetail(rawBody)) return rawBody;

    const rawMessage = (rawBody as { message?: unknown } | null)?.message;
    const detail = typeof rawMessage === 'string' ? rawMessage : exception.message;
    return buildProblemDetail(exception.getStatus(), undefined, detail);
  }

  private isProblemDetail(body: unknown): body is ProblemDetail {
    return (
      typeof body === 'object' &&
      body !== null &&
      typeof (body as ProblemDetail).type === 'string' &&
      typeof (body as ProblemDetail).title === 'string' &&
      typeof (body as ProblemDetail).status === 'number'
    );
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
    this.tracingPort.setActiveSpanAttributes({ 'error.code': code });
  }
}
