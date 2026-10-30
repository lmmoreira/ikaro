import { HttpException, HttpStatus } from '@nestjs/common';
import { buildProblemDetail, ProblemDetail } from '@ikaro/types/protocol/errors';
import { ServiceBookingPolicyInvalidError } from '../../domain/errors/booking-service-policy.error';

// A booking-policy refusal whose window reasons name the business limit: forwards `params` so the
// client can interpolate it into the translated text. Throws for that error and returns for
// anything else, so mapBookingError() can call it first and fall through to its generic lookup.
export function mapServicePolicyProblem(err: unknown): void {
  if (!(err instanceof ServiceBookingPolicyInvalidError)) return;

  const body: ProblemDetail = {
    ...buildProblemDetail(HttpStatus.UNPROCESSABLE_ENTITY, err.code, err.message, err.field),
    ...(err.params ? { params: { ...err.params } } : {}),
  };
  throw new HttpException(body, HttpStatus.UNPROCESSABLE_ENTITY);
}
