// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import type { EditorView, LeadFormConfigDraft } from './hotsite-editor-views';
import {
  applyModuleConfig,
  buildPreviewDraft,
  cancelModuleConfig,
  commitModuleBuffer,
  isModuleBufferDirty,
} from './hotsite-module-buffer';

function makeDraft(leadFormData: Record<string, unknown>): HotsiteAdminContentResponse {
  return {
    branding: {},
    layout: [{ type: 'LEAD_FORM', enabled: true, data: leadFormData }],
    seo: {},
    updatedAt: '2026-08-26T00:00:00.000Z',
    isPublished: false,
  } as unknown as HotsiteAdminContentResponse;
}

describe('hotsite module buffer helpers', () => {
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

  describe('commitModuleBuffer', () => {
    const validConfig = {
      audienceMode: 'CUSTOMER_ONLY',
      questions: [{ id: 'q1', label: 'Nome', type: 'TEXT', required: true, order: 0 }],
    };

    it('commits an ordinary module buffer as it is', () => {
      const onLeadFormConfig = vi.fn();
      const onCommit = vi.fn();

      const committed = commitModuleBuffer(
        { type: 'CONTACT', localData: { title: 'Fale conosco' } },
        onLeadFormConfig,
        onCommit,
      );

      expect(committed).toBe(true);
      expect(onCommit).toHaveBeenCalledWith('CONTACT', { title: 'Fale conosco' });
      expect(onLeadFormConfig).not.toHaveBeenCalled();
    });

    it('never writes audienceMode/questions into the committed LEAD_FORM layout data', () => {
      const onLeadFormConfig = vi.fn();
      const onCommit = vi.fn();

      commitModuleBuffer(
        { type: 'LEAD_FORM', localData: { title: 'Olá', ...validConfig } },
        onLeadFormConfig,
        onCommit,
      );

      expect(onCommit).toHaveBeenCalledWith('LEAD_FORM', { title: 'Olá' });
      expect(onLeadFormConfig).toHaveBeenCalledWith(validConfig);
    });

    it('commits nothing for a LEAD_FORM buffer with an invalid question', () => {
      const onLeadFormConfig = vi.fn();
      const onCommit = vi.fn();

      const committed = commitModuleBuffer(
        {
          type: 'LEAD_FORM',
          localData: {
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
          },
        },
        onLeadFormConfig,
        onCommit,
      );

      expect(committed).toBe(false);
      expect(onCommit).not.toHaveBeenCalled();
      expect(onLeadFormConfig).not.toHaveBeenCalled();
    });

    it('commits nothing for a LEAD_FORM buffer without a LeadFormConfig portion', () => {
      const onCommit = vi.fn();

      expect(
        commitModuleBuffer({ type: 'LEAD_FORM', localData: { title: 'Olá' } }, vi.fn(), onCommit),
      ).toBe(false);
      expect(onCommit).not.toHaveBeenCalled();
    });
  });

  describe('isModuleBufferDirty', () => {
    const draft = {
      branding: {},
      layout: [
        { type: 'CONTACT', enabled: true, data: { title: 'Fale conosco' } },
        { type: 'LEAD_FORM', enabled: true, data: { title: 'Olá' } },
      ],
      seo: {},
      updatedAt: '2026-08-26T00:00:00.000Z',
      isPublished: false,
    } as unknown as HotsiteAdminContentResponse;
    const baseline: LeadFormConfigDraft = { audienceMode: 'CUSTOMER_ONLY', questions: [] };

    it('is clean when the buffer equals the committed layout data', () => {
      expect(
        isModuleBufferDirty({ type: 'CONTACT', localData: { title: 'Fale conosco' } }, draft, null),
      ).toBe(false);
    });

    it('is dirty once a field differs from the committed layout data', () => {
      expect(
        isModuleBufferDirty({ type: 'CONTACT', localData: { title: 'Outro' } }, draft, null),
      ).toBe(true);
    });

    it('is clean for a LEAD_FORM buffer that only carries the baseline LeadFormConfig', () => {
      expect(
        isModuleBufferDirty(
          { type: 'LEAD_FORM', localData: { title: 'Olá', ...baseline } },
          draft,
          baseline,
        ),
      ).toBe(false);
    });

    it('is dirty when a LEAD_FORM buffer changes the audience mode', () => {
      expect(
        isModuleBufferDirty(
          {
            type: 'LEAD_FORM',
            localData: { title: 'Olá', audienceMode: 'GUEST_AND_CUSTOMER', questions: [] },
          },
          draft,
          baseline,
        ),
      ).toBe(true);
    });
  });

  describe('buildPreviewDraft', () => {
    const draft = {
      branding: {},
      layout: [
        { type: 'CONTACT', enabled: true, data: { title: 'Antes' } },
        { type: 'HERO', enabled: true, data: { title: 'Hero' } },
      ],
      seo: {},
      updatedAt: '2026-08-26T00:00:00.000Z',
      isPublished: false,
    } as unknown as HotsiteAdminContentResponse;

    it('returns the draft itself when no module is open', () => {
      expect(buildPreviewDraft(draft, null)).toBe(draft);
    });

    it('merges the open buffer into its module without touching the others or the draft', () => {
      const preview = buildPreviewDraft(draft, { type: 'CONTACT', localData: { title: 'Depois' } });

      expect(preview.layout).toEqual([
        { type: 'CONTACT', enabled: true, data: { title: 'Depois' } },
        { type: 'HERO', enabled: true, data: { title: 'Hero' } },
      ]);
      expect(draft.layout[0]?.data).toEqual({ title: 'Antes' });
    });

    it('strips the LeadFormConfig portion from a LEAD_FORM buffer', () => {
      const withLeadForm = {
        ...draft,
        layout: [{ type: 'LEAD_FORM', enabled: true, data: {} }],
      } as unknown as HotsiteAdminContentResponse;

      const preview = buildPreviewDraft(withLeadForm, {
        type: 'LEAD_FORM',
        localData: { title: 'Olá', audienceMode: 'CUSTOMER_ONLY', questions: [{ id: 'q1' }] },
      });

      expect(preview.layout[0]?.data).toEqual({ title: 'Olá' });
    });
  });
});
