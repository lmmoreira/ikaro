import { ServicePublicSlugInvalidError } from './errors/booking-domain.error';
import { ServicePublicSlug } from './service-public-slug.vo';

describe('ServicePublicSlug', () => {
  describe('fromName()', () => {
    it.each([
      ['Massagem Relaxante', 'massagem-relaxante'],
      ['  Lavagem   Completa!  ', 'lavagem-completa'],
      ['Drenagem Linfática & Modeladora', 'drenagem-linfatica-modeladora'],
      ['Ação — 60 min', 'acao-60-min'],
    ])('derives "%s" → "%s"', (name, expected) => {
      expect(ServicePublicSlug.fromName(name).value).toBe(expected);
    });

    it.each(['🙂', '!!', 'a', ''])(
      'falls back to "servico" for a name with no usable text ("%s")',
      (name) => {
        expect(ServicePublicSlug.fromName(name).value).toBe('servico');
      },
    );

    it('caps the slug at 60 characters without leaving a trailing hyphen', () => {
      const slug = ServicePublicSlug.fromName(`${'a'.repeat(59)} bbbb`).value;
      expect(slug.length).toBeLessThanOrEqual(60);
      expect(slug.endsWith('-')).toBe(false);
    });

    it('appends the unique suffix and still fits 60 characters', () => {
      const slug = ServicePublicSlug.fromName('x'.repeat(100), 'ab12cd').value;
      expect(slug).toBe(`${'x'.repeat(53)}-ab12cd`);
      expect(slug).toHaveLength(60);
    });

    it('appends the suffix to a short base', () => {
      expect(ServicePublicSlug.fromName('Massagem', 'ab12cd').value).toBe('massagem-ab12cd');
    });
  });

  describe('create()', () => {
    it('normalizes case and surrounding whitespace', () => {
      expect(ServicePublicSlug.create('  Massagem-1 ').value).toBe('massagem-1');
    });

    it.each(['ab', 'a'.repeat(61)])('rejects a length outside 3–60 (%#)', (raw) => {
      expect(() => ServicePublicSlug.create(raw)).toThrow(ServicePublicSlugInvalidError);
    });

    it.each(['-abc', 'abc-', 'a--b', 'a b c', 'açaí', 'a_b_c'])(
      'rejects a malformed slug "%s"',
      (raw) => {
        expect(() => ServicePublicSlug.create(raw)).toThrow(ServicePublicSlugInvalidError);
      },
    );
  });

  it('reconstitute() skips validation and toString() returns the value', () => {
    const slug = ServicePublicSlug.reconstitute('Legacy_Value');
    expect(slug.value).toBe('Legacy_Value');
    expect(`${slug}`).toBe('Legacy_Value');
  });
});
