// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { useHotsiteEditorSession } from './useHotsiteEditorSession';
import type { LeadFormConfigDraft } from './hotsite-editor-views';
import { useVisualModuleBuffer } from './useVisualModuleBuffer';

function makeDraft(contactTitle: string): HotsiteAdminContentResponse {
  return {
    branding: {},
    layout: [
      { type: 'CONTACT', enabled: true, data: { title: contactTitle } },
      { type: 'ABOUT', enabled: true, data: { title: 'Sobre' } },
      { type: 'LEAD_FORM', enabled: true, data: { title: 'Olá' } },
    ],
    seo: {},
    updatedAt: '2026-10-22T00:00:00.000Z',
    isPublished: false,
  } as unknown as HotsiteAdminContentResponse;
}

function setup(
  initialDraft = makeDraft('Fale conosco'),
  leadFormConfigBaseline: LeadFormConfigDraft | null = null,
) {
  const onLayoutChange = vi.fn();
  const onLeadFormConfig = vi.fn();
  const onCommit = vi.fn();
  const onClearBanner = vi.fn();
  const rendered = renderHook(
    ({ draft }: { draft: HotsiteAdminContentResponse }) => {
      const session = useHotsiteEditorSession();
      const guard = useVisualModuleBuffer({
        visualContext: session.visualContext,
        draft,
        leadFormConfigBaseline,
        navigation: session,
        onLayoutChange,
        onLeadFormConfig,
        onCommit,
        onClearBanner,
      });
      return { session, guard };
    },
    { initialProps: { draft: initialDraft } },
  );
  return { ...rendered, onLayoutChange, onLeadFormConfig, onCommit, onClearBanner };
}

// Opens CONTACT and makes its buffer differ from the committed draft.
function openDirtyContact(result: ReturnType<typeof setup>['result']): void {
  act(() => result.current.guard.requestSelectModule('CONTACT'));
  act(() => result.current.session.updateModuleBuffer({ title: 'Editado' }));
}

describe('useVisualModuleBuffer', () => {
  it('has no buffer and is not dirty in the structure context', () => {
    const { result } = setup();

    expect(result.current.guard.buffer).toBeNull();
    expect(result.current.guard.isDirty).toBe(false);
    expect(result.current.guard.discardConfirmOpen).toBe(false);
  });

  it("opens a module on a buffer built from the draft's committed data", () => {
    const { result } = setup();

    act(() => result.current.guard.requestSelectModule('CONTACT'));

    expect(result.current.guard.buffer).toEqual({
      type: 'CONTACT',
      localData: { title: 'Fale conosco' },
    });
    expect(result.current.guard.isDirty).toBe(false);
  });

  it('becomes dirty once the buffer differs from the draft', () => {
    const { result } = setup();

    openDirtyContact(result);

    expect(result.current.guard.isDirty).toBe(true);
  });

  it('switches module straight away while the buffer is clean, with no confirmation', () => {
    const { result } = setup();
    act(() => result.current.guard.requestSelectModule('CONTACT'));

    act(() => result.current.guard.requestSelectModule('ABOUT'));

    expect(result.current.guard.buffer?.type).toBe('ABOUT');
    expect(result.current.guard.discardConfirmOpen).toBe(false);
  });

  it('asks before leaving a dirty buffer for another section, and loses nothing until confirmed', () => {
    const { result } = setup();
    openDirtyContact(result);

    act(() => result.current.guard.requestSelectModule('ABOUT'));

    expect(result.current.guard.discardConfirmOpen).toBe(true);
    expect(result.current.guard.buffer).toEqual({
      type: 'CONTACT',
      localData: { title: 'Editado' },
    });
  });

  it('keeps editing: closes the confirmation and keeps the dirty buffer', () => {
    const { result } = setup();
    openDirtyContact(result);
    act(() => result.current.guard.requestSelectModule('ABOUT'));

    act(() => result.current.guard.keepEditing());

    expect(result.current.guard.discardConfirmOpen).toBe(false);
    expect(result.current.guard.buffer).toEqual({
      type: 'CONTACT',
      localData: { title: 'Editado' },
    });
  });

  it('discards on confirm and completes the move that was asked for', () => {
    const { result } = setup();
    openDirtyContact(result);
    act(() => result.current.guard.requestSelectModule('ABOUT'));

    act(() => result.current.guard.confirmDiscard());

    expect(result.current.guard.discardConfirmOpen).toBe(false);
    expect(result.current.guard.buffer).toEqual({ type: 'ABOUT', localData: { title: 'Sobre' } });
    expect(result.current.guard.isDirty).toBe(false);
  });

  it('asks before returning to the structure list from a dirty buffer, then discards on confirm', () => {
    const { result } = setup();
    openDirtyContact(result);

    act(() => result.current.guard.requestStructure());
    expect(result.current.guard.discardConfirmOpen).toBe(true);
    expect(result.current.session.visualContext.kind).toBe('module');

    act(() => result.current.guard.confirmDiscard());
    expect(result.current.session.visualContext).toEqual({ kind: 'structure' });
  });

  it('returns to the structure list without asking while the buffer is clean', () => {
    const { result } = setup();
    act(() => result.current.guard.requestSelectModule('CONTACT'));

    act(() => result.current.guard.requestStructure());

    expect(result.current.session.visualContext).toEqual({ kind: 'structure' });
    expect(result.current.guard.discardConfirmOpen).toBe(false);
  });

  it.each(['branding', 'sharing'] as const)(
    'never switches to %s from a dirty buffer without the Apply-or-discard decision',
    (kind) => {
      const { result } = setup();
      openDirtyContact(result);

      act(() => result.current.guard.requestGlobalContext(kind));

      expect(result.current.guard.discardConfirmOpen).toBe(true);
      expect(result.current.session.visualContext.kind).toBe('module');
      expect(result.current.guard.buffer).toEqual({
        type: 'CONTACT',
        localData: { title: 'Editado' },
      });

      act(() => result.current.guard.confirmDiscard());

      expect(result.current.session.visualContext).toEqual({ kind });
      expect(result.current.guard.buffer).toBeNull();
    },
  );

  it.each(['branding', 'sharing'] as const)(
    'keeps the dirty buffer and the current context when editing continues instead of leaving for %s',
    (kind) => {
      const { result } = setup();
      openDirtyContact(result);
      act(() => result.current.guard.requestGlobalContext(kind));

      act(() => result.current.guard.keepEditing());

      expect(result.current.guard.discardConfirmOpen).toBe(false);
      expect(result.current.session.visualContext.kind).toBe('module');
      expect(result.current.guard.isDirty).toBe(true);
    },
  );

  it.each(['branding', 'sharing', 'structure'] as const)(
    'switches to %s straight away while the buffer is clean, with no confirmation',
    (kind) => {
      const { result } = setup();
      act(() => result.current.guard.requestSelectModule('CONTACT'));

      act(() => result.current.guard.requestGlobalContext(kind));

      expect(result.current.session.visualContext).toEqual({ kind });
      expect(result.current.guard.discardConfirmOpen).toBe(false);
    },
  );

  it('never enters the detailed editor from a dirty buffer without the decision', () => {
    const { result } = setup();
    openDirtyContact(result);

    act(() => result.current.guard.requestEditInDetail());
    expect(result.current.session.mode).toBe('visual');
    expect(result.current.guard.discardConfirmOpen).toBe(true);

    act(() => result.current.guard.confirmDiscard());
    expect(result.current.session.mode).toBe('detailed');
  });

  it('enters the detailed editor straight away while the buffer is clean', () => {
    const { result } = setup();

    act(() => result.current.guard.requestEditInDetail());

    expect(result.current.session.mode).toBe('detailed');
    expect(result.current.guard.discardConfirmOpen).toBe(false);
  });

  it('keeps the dirty buffer when the open module is selected again', () => {
    const { result } = setup();
    openDirtyContact(result);

    act(() => result.current.guard.requestSelectModule('CONTACT'));

    expect(result.current.guard.discardConfirmOpen).toBe(false);
    expect(result.current.guard.buffer).toEqual({
      type: 'CONTACT',
      localData: { title: 'Editado' },
    });
  });

  it('commits the buffer on Apply, clears the banner and returns to the structure list', () => {
    const { result, onCommit, onClearBanner } = setup();
    openDirtyContact(result);

    act(() => result.current.guard.apply());

    expect(onCommit).toHaveBeenCalledWith('CONTACT', { title: 'Editado' });
    expect(onClearBanner).toHaveBeenCalledTimes(1);
    expect(result.current.session.visualContext).toEqual({ kind: 'structure' });
  });

  it('keeps the module open and commits nothing when Apply is refused for an invalid LEAD_FORM', () => {
    const { result, onCommit, onLeadFormConfig } = setup();
    act(() => result.current.guard.requestSelectModule('LEAD_FORM'));
    act(() =>
      result.current.session.updateModuleBuffer({
        title: 'Olá',
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
    );

    act(() => result.current.guard.apply());

    expect(onCommit).not.toHaveBeenCalled();
    expect(onLeadFormConfig).not.toHaveBeenCalled();
    expect(result.current.session.visualContext.kind).toBe('module');
  });

  it('does nothing on Apply when no module is open', () => {
    const { result, onCommit } = setup();

    act(() => result.current.guard.apply());

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("reloads the open module's buffer from the draft when coming back from the detailed editor", () => {
    const { result, rerender } = setup();
    act(() => result.current.guard.requestSelectModule('CONTACT'));
    act(() => result.current.guard.requestEditInDetail());

    // The manager changed this module in the detailed editor in the meantime.
    rerender({ draft: makeDraft('Alterado no detalhe') });
    act(() => result.current.guard.backToVisual());

    expect(result.current.session.mode).toBe('visual');
    expect(result.current.guard.buffer).toEqual({
      type: 'CONTACT',
      localData: { title: 'Alterado no detalhe' },
    });
    expect(result.current.guard.isDirty).toBe(false);
  });

  it('returns from the detailed editor to the structure list when no module was open', () => {
    const { result } = setup();
    act(() => result.current.guard.requestEditInDetail());

    act(() => result.current.guard.backToVisual());

    expect(result.current.session.mode).toBe('visual');
    expect(result.current.session.visualContext).toEqual({ kind: 'structure' });
  });

  it('keeps one backToVisual identity across renders (it is a topbar effect dependency)', () => {
    const { result, rerender } = setup();
    const first = result.current.guard.backToVisual;

    rerender({ draft: makeDraft('Outro') });

    expect(result.current.guard.backToVisual).toBe(first);
  });

  describe('inspector actions', () => {
    it('forwards layout changes straight to the editor', () => {
      const { result, onLayoutChange } = setup();
      const layout = makeDraft('x').layout;

      result.current.guard.inspector.onLayoutChange(layout);

      expect(onLayoutChange).toHaveBeenCalledWith(layout);
    });

    it('routes buffer edits into the open module context', () => {
      const { result } = setup();
      act(() => result.current.guard.requestSelectModule('CONTACT'));

      act(() => result.current.guard.inspector.onBufferChange({ title: 'Novo' }));

      expect(result.current.guard.buffer?.localData).toEqual({ title: 'Novo' });
    });

    it('leaving the module from the inspector asks first when dirty, and applies through Apply', () => {
      const { result, onCommit } = setup();
      openDirtyContact(result);

      act(() => result.current.guard.inspector.onLeaveModule());
      expect(result.current.guard.inspector.discardConfirmOpen).toBe(true);
      act(() => result.current.guard.inspector.onKeepEditing());
      expect(result.current.guard.inspector.discardConfirmOpen).toBe(false);

      act(() => result.current.guard.inspector.onApply());
      expect(onCommit).toHaveBeenCalledWith('CONTACT', { title: 'Editado' });
    });
  });

  describe('LEAD_FORM buffer', () => {
    const baseline: LeadFormConfigDraft = { audienceMode: 'CUSTOMER_ONLY', questions: [] };

    it('opens already carrying the loaded LeadFormConfig, so an untouched buffer is clean', () => {
      const { result } = setup(makeDraft('Fale conosco'), baseline);

      act(() => result.current.guard.requestSelectModule('LEAD_FORM'));

      expect(result.current.guard.buffer?.localData).toEqual({ title: 'Olá', ...baseline });
      expect(result.current.guard.isDirty).toBe(false);
    });

    it('does not ask before switching away from an untouched LEAD_FORM', () => {
      const { result } = setup(makeDraft('Fale conosco'), baseline);
      act(() => result.current.guard.requestSelectModule('LEAD_FORM'));

      act(() => result.current.guard.requestSelectModule('CONTACT'));

      expect(result.current.guard.discardConfirmOpen).toBe(false);
      expect(result.current.guard.buffer?.type).toBe('CONTACT');
    });

    it('is dirty once the audience mode is changed', () => {
      const { result } = setup(makeDraft('Fale conosco'), baseline);
      act(() => result.current.guard.requestSelectModule('LEAD_FORM'));

      act(() =>
        result.current.session.updateModuleBuffer({
          title: 'Olá',
          audienceMode: 'GUEST_AND_CUSTOMER',
          questions: [],
        }),
      );

      expect(result.current.guard.isDirty).toBe(true);
    });
  });
});
