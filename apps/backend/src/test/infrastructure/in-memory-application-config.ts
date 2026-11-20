import type { IApplicationConfig } from '../../shared/ports/application-config.port';

/** The application config a spec stands up: the keys it gives, and a missing one throws like the real adapter. */
export class InMemoryApplicationConfig implements IApplicationConfig {
  constructor(private readonly values: Readonly<Record<string, string>>) {}

  getOrThrow(key: string): string {
    const value = this.values[key];
    if (value === undefined) throw new Error(`Config key not set: ${key}`);
    return value;
  }
}
