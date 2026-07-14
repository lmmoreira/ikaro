import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { AuthErrorCode, ProblemDetail } from '@ikaro/types';
import { AppLogger } from '../observability/app-logger';

type MinimalRequest = { path: string; method: string };

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  private readonly logger = new AppLogger(ErrorInterceptor.name);

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
