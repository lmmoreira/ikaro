import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      catchError((err: unknown) => {
        if (err instanceof HttpException) return throwError(() => err);

        const status = HttpStatus.INTERNAL_SERVER_ERROR;
        const problem = {
          type: 'https://beloauto.com/errors/internal',
          title: 'Internal Server Error',
          status,
          instance: req.path,
        };

        return throwError(() => new HttpException(problem, status));
      }),
    );
  }
}
