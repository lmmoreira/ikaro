import { buildTemplateManifest } from './build-template-manifest';
import { getTemplateDefinition } from './catalogue';

const IDENTITY = { brandName: 'Marca Exemplo', tagline: 'Slogan de exemplo' };

describe('buildTemplateManifest', () => {
  it('returns the template palette with the given identity, no logo and no SEO', () => {
    const manifest = buildTemplateManifest('casa47', 'pt-BR', IDENTITY);

    expect(manifest.branding).toMatchObject({
      primaryColor: getTemplateDefinition('casa47').branding.primaryColor,
      brandName: 'Marca Exemplo',
      brandTagline: 'Slogan de exemplo',
      logoUrl: '',
    });
    expect(manifest.seo).toEqual({ title: null, description: null, ogImageUrl: '' });
  });

  it('keeps the definition module order and enabled set', () => {
    const manifest = buildTemplateManifest('lume-studio', 'en', IDENTITY);
    const definition = getTemplateDefinition('lume-studio');

    expect(manifest.layout.map((module) => [module.type, module.enabled])).toEqual(
      definition.layout.map((module) => [module.type, module.enabled]),
    );
  });

  it('writes the copy of the requested locale', () => {
    const hero = (locale: 'pt-BR' | 'en') =>
      buildTemplateManifest('casa47', locale, IDENTITY).layout.find((m) => m.type === 'HERO')?.data
        .title;

    expect(hero('pt-BR')).toBe('Seu estilo, no seu ritmo.');
    expect(hero('en')).toBe('Your style, at your pace.');
  });

  it('never mutates the definition it is built from', () => {
    const before = JSON.stringify(getTemplateDefinition('origem'));

    buildTemplateManifest('origem', 'pt-BR', IDENTITY);

    expect(JSON.stringify(getTemplateDefinition('origem'))).toBe(before);
  });
});
