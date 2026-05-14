export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  [key: string]: unknown;
}

export interface ValidationViolation {
  field: string;
  message: string;
}

export interface ValidationProblemDetail extends ProblemDetail {
  violations: ValidationViolation[];
}
