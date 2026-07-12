import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';
import {
  HotsiteNotFoundError,
  PlatformDomainError,
  SlugAlreadyTakenError,
  TenantInactiveError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';

export function mapPlatformError(err: unknown): never {
  mapSharedAddressError(err);
  mapSharedVoError(err);
  if (err instanceof SlugAlreadyTakenError || err instanceof TenantInactiveError) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message, err.field);
  }
  if (err instanceof TenantNotFoundError || err instanceof HotsiteNotFoundError) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message, err.field);
  }
  if (err instanceof PlatformDomainError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
