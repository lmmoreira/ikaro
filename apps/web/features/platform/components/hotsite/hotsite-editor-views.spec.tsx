// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import {
  buildModuleBuffer,
  configureModule,
  extractLeadFormConfig,
  hasInvalidLeadFormQuestion,
  stripLeadFormConfig,
} from './hotsite-editor-views';

function makeDraft(leadFormData: Record<string, unknown>): HotsiteAdminContentResponse {
  return {
    branding: {},
    layout: [{ type: 'LEAD_FORM', enabled: true, data: leadFormData }],
    seo: {},
    updatedAt: '2026-08-26T00:00:00.000Z',
    isPublished: false,
  } as unknown as HotsiteAdminContentResponse;
}

describe('hotsite editor lead-form view helpers', () => {
  it('strips submission metadata before building the editable config', () => {
    const config = extractLeadFormConfig({
      audienceMode: 'CUSTOMER_ONLY',
      questions: [
        { id: 'q1', label: 'Nome', type: 'TEXT', required: true, order: 0, hasSubmissions: true },
      ],
    });
    expect(config?.questions[0]).not.toHaveProperty('hasSubmissions');
  });

  it('returns null for an unknown audienceMode', () => {
    expect(extractLeadFormConfig({ audienceMode: 'EVERYONE', questions: [] })).toBeNull();
  });

  it('returns null when questions is missing', () => {
    expect(extractLeadFormConfig({ audienceMode: 'CUSTOMER_ONLY' })).toBeNull();
  });

  it('rejects incomplete choice questions', () => {
    expect(
      hasInvalidLeadFormQuestion({
        audienceMode: 'CUSTOMER_ONLY',
        questions: [
          {
            id: 'q1',
            label: 'Serviço',
            type: 'SINGLE_CHOICE',
            required: true,
            order: 0,
            options: [''],
          },
        ],
      }),
    ).toBe(true);
  });

  it('strips audienceMode and questions while preserving teaser fields', () => {
    const stripped = stripLeadFormConfig({
      title: 'Fale com a gente',
      ctaLabel: 'Quero conversar',
      audienceMode: 'CUSTOMER_ONLY',
      questions: [{ id: 'q1', label: 'Nome', type: 'TEXT', required: true, order: 0 }],
    });
    expect(stripped).toEqual({ title: 'Fale com a gente', ctaLabel: 'Quero conversar' });
  });
});

describe('module buffer helpers', () => {
  const LEAD_FORM_CONFIG = {
    audienceMode: 'CUSTOMER_ONLY' as const,
    questions: [],
  };

  it("builds a module's buffer from its layout data", () => {
    const draft = {
      layout: [{ type: 'ABOUT', enabled: true, data: { title: 'Sobre nós' } }],
    } as unknown as HotsiteAdminContentResponse;

    expect(buildModuleBuffer(draft, 'ABOUT', null)).toEqual({ title: 'Sobre nós' });
  });

  it('builds an empty buffer for a module the draft does not carry', () => {
    expect(buildModuleBuffer(makeDraft({}), 'ABOUT', null)).toEqual({});
  });

  it('folds the held LeadFormConfig portion into a LEAD_FORM buffer only', () => {
    const draft = makeDraft({ title: 'Receba uma proposta' });

    expect(buildModuleBuffer(draft, 'LEAD_FORM', LEAD_FORM_CONFIG)).toEqual({
      title: 'Receba uma proposta',
      ...LEAD_FORM_CONFIG,
    });
    expect(buildModuleBuffer(draft, 'LEAD_FORM', null)).toEqual({ title: 'Receba uma proposta' });
  });

  it('opens the module-config view on the same buffer', () => {
    const onConfigure = vi.fn();

    configureModule(makeDraft({ title: 'x' }), 'LEAD_FORM', LEAD_FORM_CONFIG, onConfigure);

    expect(onConfigure).toHaveBeenCalledWith({
      view: 'module-config',
      type: 'LEAD_FORM',
      localData: { title: 'x', ...LEAD_FORM_CONFIG },
    });
  });
});
