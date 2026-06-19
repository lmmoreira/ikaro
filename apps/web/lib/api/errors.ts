export class AuthError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'AuthError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ForbiddenError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'ApiError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
