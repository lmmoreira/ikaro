export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  code?: string;
  field?: string;
  params?: Record<string, string | number>;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

export interface ValidationViolation {
  field: string;
  code: string;
  params?: Record<string, string | number>;
}

export interface ValidationProblemDetail extends ProblemDetail {
  violations: ValidationViolation[];
}

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

// Canonical single-cause envelope builder (TD23) — every backend/BFF site constructing a
// non-batch { code, field? } ProblemDetail should go through this instead of hand-writing the
// { type, title, status, ... } literal. Deliberately framework-agnostic (no @nestjs/common
// import) so it stays safe for apps/web to import too — the HttpException-throwing wrapper
// lives in @ikaro/nestjs-http instead, never here (see that package's own comment for why:
// a runtime @nestjs/common import inside this shared barrel breaks web's production build even
// when @nestjs/common is only a peer dependency).
export function buildProblemDetail(
  status: number,
  code: string | undefined,
  detail: string,
  field?: string,
): ProblemDetail {
  return {
    type: 'about:blank',
    title: STATUS_TITLES[status] ?? 'Error',
    status,
    ...(code ? { code } : {}),
    detail,
    ...(field ? { field } : {}),
  };
}
