// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import {
  applyModuleConfig,
  cancelModuleConfig,
  extractLeadFormConfig,
  hasInvalidLeadFormQuestion,
  stripLeadFormConfig,
  type EditorView,
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

  describe('cancelModuleConfig — LEAD_FORM (found live, 2026-08-26: the confirm dialog was showing unconditionally)', () => {
    // committed (layout[].data alone) never carries audienceMode/questions by design — the panel's
    // own localData does, once its GET fetch resolves. Without merging a matching baseline in,
    // committed and localData could never be equal, so every open+back showed the discard-confirm
    // dialog even with zero edits.
    it('does not require confirmation when nothing was actually edited', () => {
      const layoutData = { title: 'Fale com a gente', ctaLabel: 'Quero conversar' };
      const leadFormBaseline = {
        audienceMode: 'CUSTOMER_ONLY' as const,
        questions: [{ id: 'q1', label: 'Nome', type: 'TEXT' as const, required: true, order: 0 }],
      };
      const view: EditorView = {
        view: 'module-config',
        type: 'LEAD_FORM',
        // Exactly what LeadFormConfigPanel's own GET-sync converges localData to: teaser fields
        // plus the fetched audienceMode/questions, each question also carrying hasSubmissions
        // (a read-only annotation the baseline above never has).
        localData: {
          ...layoutData,
          audienceMode: leadFormBaseline.audienceMode,
          questions: leadFormBaseline.questions.map((q) => ({ ...q, hasSubmissions: true })),
        },
      };
      const onConfirmRequired = vi.fn();
      const onCancel = vi.fn();

      cancelModuleConfig(
        view,
        makeDraft(layoutData),
        leadFormBaseline,
        onConfirmRequired,
        onCancel,
      );

      expect(onConfirmRequired).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledOnce();
    });

    it('requires confirmation when a teaser field was actually edited', () => {
      const layoutData = { title: 'Fale com a gente', ctaLabel: 'Quero conversar' };
      const leadFormBaseline = { audienceMode: 'CUSTOMER_ONLY' as const, questions: [] };
      const view: EditorView = {
        view: 'module-config',
        type: 'LEAD_FORM',
        localData: { ...layoutData, title: 'Título editado', ...leadFormBaseline },
      };
      const onConfirmRequired = vi.fn();
      const onCancel = vi.fn();

      cancelModuleConfig(
        view,
        makeDraft(layoutData),
        leadFormBaseline,
        onConfirmRequired,
        onCancel,
      );

      expect(onConfirmRequired).toHaveBeenCalledOnce();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('requires confirmation when audienceMode was actually edited', () => {
      const layoutData = { title: 'Fale com a gente', ctaLabel: 'Quero conversar' };
      const leadFormBaseline = { audienceMode: 'GUEST_AND_CUSTOMER' as const, questions: [] };
      const view: EditorView = {
        view: 'module-config',
        type: 'LEAD_FORM',
        localData: { ...layoutData, audienceMode: 'CUSTOMER_ONLY', questions: [] },
      };
      const onConfirmRequired = vi.fn();
      const onCancel = vi.fn();

      cancelModuleConfig(
        view,
        makeDraft(layoutData),
        leadFormBaseline,
        onConfirmRequired,
        onCancel,
      );

      expect(onConfirmRequired).toHaveBeenCalledOnce();
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('falls back to teaser-only comparison when no baseline is available yet (fetch still pending)', () => {
      const layoutData = { title: 'Fale com a gente', ctaLabel: 'Quero conversar' };
      const view: EditorView = {
        view: 'module-config',
        type: 'LEAD_FORM',
        localData: { ...layoutData },
      };
      const onConfirmRequired = vi.fn();
      const onCancel = vi.fn();

      cancelModuleConfig(view, makeDraft(layoutData), null, onConfirmRequired, onCancel);

      expect(onConfirmRequired).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledOnce();
    });
  });
});
