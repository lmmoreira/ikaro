import { ArgumentsHost, Catch, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { BaseErrorFilter } from '@ikaro/nestjs-http';
import { AuthErrorCode, buildProblemDetail } from '@ikaro/types';
import { AppLogger } from '../observability/app-logger';
import { TransactionContentionError } from '../infrastructure/transaction-contention.error';

@Catch()
@Injectable()
export class ErrorFilter extends BaseErrorFilter {
  constructor() {
    super(new AppLogger(ErrorFilter.name));
  }

  // A transaction that lost a lock fight (lock_timeout or a deadlock abort — M23-S49) is a
  // retryable 503, not a 500. The body is built from a fixed message, never from the error: the
  // driver's text can name SQL, a lock key or another tenant's row. BaseErrorFilter then renders
  // the HttpException (problem+json, correlationId, Retry-After on every 503) like any other.
  override catch(exception: unknown, host: ArgumentsHost): void {
    super.catch(
      exception instanceof TransactionContentionError ? toServiceBusyException() : exception,
      host,
    );
  }
}

function toServiceBusyException(): HttpException {
  return new HttpException(
    buildProblemDetail(
      HttpStatus.SERVICE_UNAVAILABLE,
      AuthErrorCode.TRANSACTION_CONTENTION,
      'The request was aborted by lock contention; retry shortly',
    ),
    HttpStatus.SERVICE_UNAVAILABLE,
  );
}
