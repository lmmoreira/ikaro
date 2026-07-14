import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthErrorCode, ProblemDetail } from '@ikaro/types';
import type { BaseAppLogger } from '@ikaro/observability';

type MinimalRequest = { path: string; method: string };

// Shared by apps/backend and apps/bff (TD23-S18) — logs `error.code` on every non-2xx
// HttpException and converts any truly-unhandled error into an RFC 9457 ProblemDetail
// instead of leaking each framework's own default (non-compliant) 500 shape. Each app
// supplies its own AppLogger subclass via the constructor; the branching/conversion logic
// itself must not be copy-pasted per app — that duplication is exactly what SonarCloud's
// new-code-duplication gate caught the first time this was written twice.
export abstract class BaseErrorInterceptor implements NestInterceptor {
  protected constructor(private readonly logger: BaseAppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<MinimalRequest>();

    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpException) {
          this.logErrorCode(err, req);
          return throwError(() => err);
        }

        this.logger.error('Unhandled exception', err instanceof Error ? err.stack : String(err), {
          code: AuthErrorCode.INTERNAL_ERROR,
          path: req.path,
          method: req.method,
        });

        const status = HttpStatus.INTERNAL_SERVER_ERROR;
        const problem: ProblemDetail = {
          type: 'about:blank',
          title: 'Internal Server Error',
          status,
          code: AuthErrorCode.INTERNAL_ERROR,
          detail: 'An unexpected error occurred',
          instance: req.path,
        };

        return throwError(() => new HttpException(problem, status));
      }),
    );
  }

  private logErrorCode(err: HttpException, req: MinimalRequest): void {
    const body = err.getResponse();
    const code =
      typeof body === 'object' && body !== null ? (body as ProblemDetail).code : undefined;
    if (!code) return;

    const logContext = { code, path: req.path, method: req.method };
    if (err.getStatus() >= 500) {
      this.logger.error('Error response', undefined, logContext);
    } else {
      this.logger.warn('Error response', logContext);
    }
  }
}
