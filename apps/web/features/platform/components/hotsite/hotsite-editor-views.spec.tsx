// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  applyModuleConfig,
  extractLeadFormConfig,
  hasInvalidLeadFormQuestion,
  stripLeadFormConfig,
  type EditorView,
} from './hotsite-editor-views';

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

  it('does not commit an invalid lead-form configuration', () => {
    const onLeadFormConfig = vi.fn();
    const onCommit = vi.fn();
    const onClearBanner = vi.fn();
    const onClose = vi.fn();
    const view: EditorView = {
      view: 'module-config',
      type: 'LEAD_FORM',
      localData: {
        audienceMode: 'CUSTOMER_ONLY',
        questions: [{ id: 'q1', label: '', type: 'TEXT', required: false, order: 0 }],
      },
    };

    applyModuleConfig(view, onLeadFormConfig, onCommit, onClearBanner, onClose);

    expect(onLeadFormConfig).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onClearBanner).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
