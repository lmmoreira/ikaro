import { resolveAppEnv } from './resolve-app-env';

describe('resolveAppEnv', () => {
  it('treats an unset APP_ENV as local', () => {
    expect(resolveAppEnv({} as NodeJS.ProcessEnv)).toBe('local');
  });

  it.each(['local', 'staging', 'production'] as const)('passes %s through', (appEnv) => {
    expect(resolveAppEnv({ APP_ENV: appEnv } as NodeJS.ProcessEnv)).toBe(appEnv);
  });

  it.each(['', 'prod', 'Production', 'ci', 'development', ' staging'])(
    'throws on the unknown value "%s"',
    (value) => {
      expect(() => resolveAppEnv({ APP_ENV: value } as NodeJS.ProcessEnv)).toThrow(
        `Unknown APP_ENV "${value}" — expected one of: local, staging, production`,
      );
    },
  );
});
