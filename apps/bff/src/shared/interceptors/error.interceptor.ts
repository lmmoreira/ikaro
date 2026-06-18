import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ErrorInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpException) return throwError(() => err);

        this.logger.error('Unhandled exception', err instanceof Error ? err.stack : String(err), {
          path: req.path,
          method: req.method,
        });

        const status = HttpStatus.INTERNAL_SERVER_ERROR;
        const problem = {
          type: 'about:blank',
          title: 'Internal Server Error',
          status,
          instance: req.path,
        };

        return throwError(() => new HttpException(problem, status));
      }),
    );
  }
}
