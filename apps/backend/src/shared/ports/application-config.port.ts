export const APPLICATION_CONFIG = Symbol('IApplicationConfig');

export interface IApplicationConfig {
  getOrThrow(key: string): string;
  /** The value of an optional key, or `null` when it is unset (never throws). */
  getOptional(key: string): string | null;
}
