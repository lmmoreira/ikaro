import { describe, expect, it } from 'vitest';
import { getMessages } from './get-messages';

describe('getMessages', () => {
  it('loads pt-BR messages', async () => {
    const messages = await getMessages('pt-BR');
    expect(messages).toBeDefined();
    // Spot-check a key from the pt-BR locale file
    expect((messages as { common: { back: string } }).common.back).toBe('Voltar');
  });

  it('loads en messages', async () => {
    const messages = await getMessages('en');
    expect(messages).toBeDefined();
    expect((messages as { common: { back: string } }).common.back).toBe('Back');
  });

  it('falls back to pt-BR for an unsupported locale', async () => {
    const messages = await getMessages('fr');
    expect((messages as { common: { back: string } }).common.back).toBe('Voltar');
  });

  it('falls back to pt-BR for an empty string locale', async () => {
    const messages = await getMessages('');
    expect((messages as { common: { back: string } }).common.back).toBe('Voltar');
  });
});
