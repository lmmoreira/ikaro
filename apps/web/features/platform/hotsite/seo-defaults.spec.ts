import { describe, expect, it } from 'vitest';
import { resolveSeoDefaults } from './seo-defaults';

const ADDRESS = {
  street: 'Rua A',
  number: '1',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30000-000',
};

describe('resolveSeoDefaults', () => {
  it.each([
    [
      'pt-BR',
      ADDRESS,
      'Lavacar — Agendamento Online em Belo Horizonte, MG',
      'Agende seu serviço na Lavacar, em Belo Horizonte, MG. Rápido, fácil e online.',
    ],
    [
      'pt-BR',
      null,
      'Lavacar — Agendamento Online',
      'Agende seu serviço na Lavacar. Rápido, fácil e online.',
    ],
    [
      'en',
      ADDRESS,
      'Lavacar — Online Booking in Belo Horizonte, MG',
      'Book your service at Lavacar, in Belo Horizonte, MG. Quick, easy, and online.',
    ],
    [
      'en',
      null,
      'Lavacar — Online Booking',
      'Book your service at Lavacar. Quick, easy, and online.',
    ],
  ] as const)('builds the %s defaults (address: %o)', async (language, address, title, desc) => {
    const defaults = await resolveSeoDefaults({ tenantName: 'Lavacar', address, language });

    expect(defaults).toEqual({ title, description: desc });
  });

  it('falls back to pt-BR for an unsupported language', async () => {
    const defaults = await resolveSeoDefaults({
      tenantName: 'Lavacar',
      address: null,
      language: 'fr-FR',
    });

    expect(defaults.title).toBe('Lavacar — Agendamento Online');
  });
});
