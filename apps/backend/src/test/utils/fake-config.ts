import { ConfigService } from '@nestjs/config';

export function fakeConfig(overrides: Record<string, string> = {}): ConfigService {
  return {
    get: (key: string, defaultValue: string) => overrides[key] ?? defaultValue,
  } as unknown as ConfigService;
}
