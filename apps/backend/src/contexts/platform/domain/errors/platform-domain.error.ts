export class PlatformDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlatformDomainError';
  }
}
