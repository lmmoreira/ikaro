import { HttpException } from '@nestjs/common';
import type { ApplyHotsiteTemplateResponse, HotsiteTemplateSummaryResponse } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { HotsiteTemplatesController } from './hotsite-templates.controller';
import {
  ApplyHotsiteTemplateBodySchema,
  HotsiteTemplateIdParamSchema,
} from './hotsite-templates.schemas';

const summaries: HotsiteTemplateSummaryResponse[] = [
  {
    id: 'casa47',
    version: 1,
    thumbnailUrl: 'https://storage.example.com/ikaro-public-staging/shared/x/thumbnail.webp',
    capabilities: ['navigation', 'split-hero'],
  },
];

const applied: ApplyHotsiteTemplateResponse = {
  content: {
    branding: {
      primaryColor: '#D3A655',
      secondaryColor: '#2A211B',
      backgroundColor: '#16130F',
      textColor: '#EEE5D8',
      headingFontFamily: 'Playfair Display',
      bodyFontFamily: 'DM Sans',
      logoUrl: '',
      borderRadius: 'sharp',
      buttonStyle: 'filled',
      spacing: 'comfortable',
      shadowStyle: 'strong',
    },
    layout: [],
    seo: { title: null, description: null, ogImageUrl: '' },
  },
  appliedTemplate: { id: 'casa47', version: 1 },
  appliedSampleTestimonials: true,
};

const body = { content: { branding: {}, layout: [], seo: {} } };

describe('HotsiteTemplatesController', () => {
  let backendHttp: ReturnType<typeof makeBackendHttp>;
  let controller: HotsiteTemplatesController;

  beforeEach(() => {
    backendHttp = makeBackendHttp();
    controller = new HotsiteTemplatesController(backendHttp);
  });

  describe('listTemplates', () => {
    it('unwraps the backend envelope into the plain list the web consumes', async () => {
      backendHttp.get.mockResolvedValueOnce({ templates: summaries });

      expect(await controller.listTemplates()).toEqual(summaries);
      expect(backendHttp.get).toHaveBeenCalledWith('/tenants/hotsite/templates');
    });

    it('propagates a backend error', async () => {
      backendHttp.get.mockRejectedValueOnce(new HttpException('boom', 500));

      await expect(controller.listTemplates()).rejects.toThrow(HttpException);
    });
  });

  describe('applyTemplate', () => {
    it('forwards the draft to the template path and returns the backend response unchanged', async () => {
      backendHttp.post.mockResolvedValueOnce(applied);

      const result = await controller.applyTemplate(
        'casa47',
        ApplyHotsiteTemplateBodySchema.parse(body),
      );

      expect(result).toBe(applied);
      expect(backendHttp.post).toHaveBeenCalledWith(
        '/tenants/hotsite/templates/casa47/apply',
        body,
      );
    });

    it('propagates a backend 404 for an unknown template', async () => {
      backendHttp.post.mockRejectedValueOnce(new HttpException({ status: 404 }, 404));

      await expect(
        controller.applyTemplate('unknown', ApplyHotsiteTemplateBodySchema.parse(body)),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('ApplyHotsiteTemplateBodySchema', () => {
    it('defaults branding and seo to empty objects', () => {
      const parsed = ApplyHotsiteTemplateBodySchema.parse({ content: { layout: [] } });

      expect(parsed.content.branding).toEqual({});
      expect(parsed.content.seo).toEqual({});
    });

    it('requires a layout', () => {
      expect(ApplyHotsiteTemplateBodySchema.safeParse({ content: {} }).success).toBe(false);
    });

    it('requires content', () => {
      expect(ApplyHotsiteTemplateBodySchema.safeParse({}).success).toBe(false);
    });

    it('rejects a module that fails the shared module schema', () => {
      const result = ApplyHotsiteTemplateBodySchema.safeParse({
        content: { layout: [{ type: 'NOPE', enabled: true, data: {} }] },
      });

      expect(result.success).toBe(false);
    });
  });

  describe('HotsiteTemplateIdParamSchema', () => {
    it.each(['casa47', 'mimo-pet', 'clinica-lume'])('accepts %s', (id) => {
      expect(HotsiteTemplateIdParamSchema.safeParse(id).success).toBe(true);
    });

    it.each(['../etc', 'Casa47', 'a/b', '', 'a b', '-x', 'x-'])('rejects %j', (id) => {
      expect(HotsiteTemplateIdParamSchema.safeParse(id).success).toBe(false);
    });
  });
});
