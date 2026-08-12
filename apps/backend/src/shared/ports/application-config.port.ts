export const APPLICATION_CONFIG = Symbol('IApplicationConfig');

export interface IApplicationConfig {
  getOrThrow(key: string): string;
}
