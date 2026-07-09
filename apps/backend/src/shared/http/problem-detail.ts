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
