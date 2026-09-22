import { describe, expect, it } from 'vitest';
import { diffLocaleKeys } from './locale-key-parity';

describe('diffLocaleKeys', () => {
  it('returns an empty diff for identical flat trees', () => {
    expect(diffLocaleKeys({ save: 'Save' }, { save: 'Salvar' })).toEqual({
      onlyInA: [],
      onlyInB: [],
    });
  });

  it('returns an empty diff for identical nested trees', () => {
    const a = { common: { save: 'Save', cancel: 'Cancel' } };
    const b = { common: { save: 'Salvar', cancel: 'Cancelar' } };
    expect(diffLocaleKeys(a, b)).toEqual({ onlyInA: [], onlyInB: [] });
  });

  it('flags a leaf key missing from b', () => {
    const a = { common: { save: 'Save', cancel: 'Cancel' } };
    const b = { common: { save: 'Salvar' } };
    expect(diffLocaleKeys(a, b)).toEqual({ onlyInA: ['common.cancel'], onlyInB: [] });
  });

  it('flags a leaf key missing from a', () => {
    const a = { common: { save: 'Save' } };
    const b = { common: { save: 'Salvar', cancel: 'Cancelar' } };
    expect(diffLocaleKeys(a, b)).toEqual({ onlyInA: [], onlyInB: ['common.cancel'] });
  });

  it('flags an entire nested branch missing from one side', () => {
    const a = { common: { save: 'Save' }, auth: { signIn: 'Sign in' } };
    const b = { common: { save: 'Salvar' } };
    expect(diffLocaleKeys(a, b)).toEqual({ onlyInA: ['auth.signIn'], onlyInB: [] });
  });

  it('treats two empty trees as identical', () => {
    expect(diffLocaleKeys({}, {})).toEqual({ onlyInA: [], onlyInB: [] });
  });

  it('reports both directions when the two trees diverge independently', () => {
    const a = { common: { save: 'Save' }, seo: { title: 'Title' } };
    const b = { common: { save: 'Salvar' }, auth: { signIn: 'Entrar' } };
    expect(diffLocaleKeys(a, b)).toEqual({
      onlyInA: ['seo.title'],
      onlyInB: ['auth.signIn'],
    });
  });
});
