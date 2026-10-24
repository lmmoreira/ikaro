import { ApplyHotsiteTemplateSchema } from './hotsite-template';

describe('ApplyHotsiteTemplateSchema', () => {
  it('defaults branding and seo to empty objects', () => {
    const parsed = ApplyHotsiteTemplateSchema.parse({ content: { layout: [] } });

    expect(parsed.content.branding).toEqual({});
    expect(parsed.content.seo).toEqual({});
  });

  it('keeps a draft with branding, layout and seo', () => {
    const parsed = ApplyHotsiteTemplateSchema.parse({
      content: {
        branding: { primaryColor: '#112233', brandName: 'Marca' },
        layout: [{ type: 'FOOTER', enabled: true, data: { tagline: 'x' } }],
        seo: { title: 'Título' },
      },
    });

    expect(parsed.content.branding.brandName).toBe('Marca');
    expect(parsed.content.layout).toHaveLength(1);
    expect(parsed.content.seo.title).toBe('Título');
  });

  it('requires content and a layout', () => {
    expect(ApplyHotsiteTemplateSchema.safeParse({}).success).toBe(false);
    expect(ApplyHotsiteTemplateSchema.safeParse({ content: {} }).success).toBe(false);
  });

  it('rejects a module that fails the shared module schema', () => {
    const result = ApplyHotsiteTemplateSchema.safeParse({
      content: { layout: [{ type: 'NOPE', enabled: true, data: {} }] },
    });

    expect(result.success).toBe(false);
  });

  it('rejects an invalid colour in the branding', () => {
    const result = ApplyHotsiteTemplateSchema.safeParse({
      content: { branding: { primaryColor: 'blue' }, layout: [] },
    });

    expect(result.success).toBe(false);
  });
});
