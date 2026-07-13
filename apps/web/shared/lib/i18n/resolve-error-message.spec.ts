import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveErrorMessage } from './resolve-error-message';

vi.mock('@ikaro/i18n/locales/en/errors.json', () => ({
  default: {
    TEST_WITH_PARAM: 'Hello {name}, you have {count} items.',
    TEST_NO_PARAM: 'A static message.',
  },
}));
vi.mock('@ikaro/i18n/locales/pt-BR/errors.json', () => ({
  default: {
    TEST_WITH_PARAM: 'Olá {name}, você tem {count} itens.',
    TEST_NO_PARAM: 'Uma mensagem estática.',
  },
}));

describe('resolveErrorMessage', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.unstubAllEnvs();
  });

  it('resolves a known code to its pt-BR translation', () => {
    expect(resolveErrorMessage('TEST_NO_PARAM', 'pt-BR')).toBe('Uma mensagem estática.');
  });

  it('resolves a known code to its en translation', () => {
    expect(resolveErrorMessage('TEST_NO_PARAM', 'en')).toBe('A static message.');
  });

  it('interpolates params into placeholders in the resolved string', () => {
    expect(resolveErrorMessage('TEST_WITH_PARAM', 'en', { name: 'Ana', count: 3 })).toBe(
      'Hello Ana, you have 3 items.',
    );
  });

  it('leaves an unmatched placeholder untouched when no param is supplied for it', () => {
    expect(resolveErrorMessage('TEST_WITH_PARAM', 'en', { name: 'Ana' })).toBe(
      'Hello Ana, you have {count} items.',
    );
  });

  it('falls back to a generic message and warns for an unrecognized code', () => {
    const message = resolveErrorMessage('SOME_UNKNOWN_CODE', 'pt-BR');
    expect(message).toBe('Algo deu errado. Tente novamente.');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('SOME_UNKNOWN_CODE'));
  });

  it('falls back to a generic message and warns when code is undefined', () => {
    const message = resolveErrorMessage(undefined, 'en');
    expect(message).toBe('Something went wrong. Please try again.');
    expect(warnSpy).toHaveBeenCalled();
  });

  it('warns in development mode when a placeholder has no matching param', () => {
    vi.stubEnv('NODE_ENV', 'development');
    resolveErrorMessage('TEST_WITH_PARAM', 'en', { name: 'Ana' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('{count}'));
  });

  it('warns in development mode when an extra param has no matching placeholder', () => {
    vi.stubEnv('NODE_ENV', 'development');
    resolveErrorMessage('TEST_NO_PARAM', 'en', { unused: 'x' });
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('"unused"'));
  });

  it('does not warn about placeholder mismatches in production mode', () => {
    vi.stubEnv('NODE_ENV', 'production');
    resolveErrorMessage('TEST_WITH_PARAM', 'en', {});
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
