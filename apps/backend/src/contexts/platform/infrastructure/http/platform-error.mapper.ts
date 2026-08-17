import { HttpStatus } from '@nestjs/common';
import { throwProblemDetail } from '@ikaro/nestjs-http';
import { mapSharedAddressError } from '../../../../shared/http/address-validation-error.mapper';
import { mapSharedVoError } from '../../../../shared/http/vo-validation-error.mapper';
import {
  HotsiteConfigConcurrentModificationError,
  HotsiteNotFoundError,
  PlatformDomainError,
  SlugAlreadyTakenError,
  TenantInactiveError,
  TenantNotFoundError,
} from '../../domain/errors/platform-domain.error';
import {
  ChatbotConcurrencyCapReachedError,
  ChatbotDailyCapReachedError,
  ChatbotGlobalSpendLimitReachedError,
  ChatbotMessageCapReachedError,
  ChatbotProviderBalanceLowError,
  ChatbotProviderUnavailableError,
  ChatbotSessionNotFoundError,
} from '../../domain/errors/chatbot-domain.error';

export function mapPlatformError(err: unknown): never {
  mapSharedAddressError(err);
  mapSharedVoError(err);
  if (
    err instanceof SlugAlreadyTakenError ||
    err instanceof TenantInactiveError ||
    err instanceof HotsiteConfigConcurrentModificationError
  ) {
    throw throwProblemDetail(HttpStatus.CONFLICT, err.code, err.message, err.field);
  }
  if (
    err instanceof TenantNotFoundError ||
    err instanceof HotsiteNotFoundError ||
    err instanceof ChatbotSessionNotFoundError
  ) {
    throw throwProblemDetail(HttpStatus.NOT_FOUND, err.code, err.message, err.field);
  }
  // Chatbot cap-rejection family (docs/discovery/CHATBOT/CHATBOT.md §8) — all map to 429,
  // including the 2 platform-wide backstops (M19-S05 story-discovery, 2026-08-12).
  if (
    err instanceof ChatbotDailyCapReachedError ||
    err instanceof ChatbotConcurrencyCapReachedError ||
    err instanceof ChatbotMessageCapReachedError ||
    err instanceof ChatbotGlobalSpendLimitReachedError ||
    err instanceof ChatbotProviderBalanceLowError
  ) {
    throw throwProblemDetail(HttpStatus.TOO_MANY_REQUESTS, err.code, err.message, err.field);
  }
  if (err instanceof ChatbotProviderUnavailableError) {
    throw throwProblemDetail(HttpStatus.SERVICE_UNAVAILABLE, err.code, err.message, err.field);
  }
  if (err instanceof PlatformDomainError) {
    throw throwProblemDetail(HttpStatus.BAD_REQUEST, err.code, err.message, err.field);
  }
  if (err instanceof Error) throw err;
  throw new Error(`Unexpected error: ${String(err)}`);
}
