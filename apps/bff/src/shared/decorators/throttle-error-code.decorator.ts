import { SetMetadata } from '@nestjs/common';
import type { BffThrowableCode } from '../http/problem-detail';

// M26-S24: the code `AppThrottlerGuard` answers a 429 with on a route that has its own public
// vocabulary (the signup POST answers SIGNUP_RATE_LIMITED, UC-127 A4). A route without it keeps the
// shared AUTH_RATE_LIMITED. One guard, one limiter: the route only renames the answer.
export const THROTTLE_ERROR_CODE_KEY = 'throttleErrorCode';
export const ThrottleErrorCode = (code: BffThrowableCode) =>
  SetMetadata(THROTTLE_ERROR_CODE_KEY, code);
