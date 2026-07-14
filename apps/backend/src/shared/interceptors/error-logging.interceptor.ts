import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import type { ProblemDetail } from '@ikaro/types';
import { AppLogger } from '../observability/app-logger';

@Injectable()
export class ErrorLoggingInterceptor implements NestInterceptor {
  private readonly logger = new AppLogger(ErrorLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ path: string; method: string }>();

    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpException) {
          const body = err.getResponse();
          const code =
            typeof body === 'object' && body !== null ? (body as ProblemDetail).code : undefined;

          if (code) {
            const logContext = { code, path: req.path, method: req.method };
            if (err.getStatus() >= 500) {
              this.logger.error('Error response', undefined, logContext);
            } else {
              this.logger.warn('Error response', logContext);
            }
          }
        }
        return throwError(() => err);
      }),
    );
  }
}
