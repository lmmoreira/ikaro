import enEmailTables from '@ikaro/i18n/locales/en/email-tables.json';
import enErrors from '@ikaro/i18n/locales/en/errors.json';
import enNotifications from '@ikaro/i18n/locales/en/notifications.json';
import enWeb from '@ikaro/i18n/locales/en/web.json';
import ptBrEmailTables from '@ikaro/i18n/locales/pt-BR/email-tables.json';
import ptBrErrors from '@ikaro/i18n/locales/pt-BR/errors.json';
import ptBrNotifications from '@ikaro/i18n/locales/pt-BR/notifications.json';
import ptBrWeb from '@ikaro/i18n/locales/pt-BR/web.json';
import { describe, expect, it } from 'vitest';
import { diffLocaleKeys } from './locale-key-parity';
import type { LocaleTree } from './locale-key-parity';

// Every locale JSON family under packages/i18n/locales must declare exactly
// the same keys in both pt-BR and en (docs/ENGINEERING_RULES.md: "always add
// the key to both locales in the same commit"). errors.json also has its own
// dedicated catalog-vs-locale check (error-codes-exhaustiveness.spec.ts,
// unchanged by this file) — it's included here too so all four families are
// covered by one shared, reusable mechanism (TD37 Story 12).
const FAMILIES: Array<[name: string, en: LocaleTree, ptBr: LocaleTree]> = [
  ['errors.json', enErrors, ptBrErrors],
  ['notifications.json', enNotifications, ptBrNotifications],
  ['web.json', enWeb, ptBrWeb],
  ['email-tables.json', enEmailTables, ptBrEmailTables],
];

describe('locale JSON family en <-> pt-BR key parity (TD37 Story 12)', () => {
  it.each(FAMILIES)('%s has identical key paths in both locales', (_name, en, ptBr) => {
    expect(diffLocaleKeys(en, ptBr)).toEqual({ onlyInA: [], onlyInB: [] });
  });
});
