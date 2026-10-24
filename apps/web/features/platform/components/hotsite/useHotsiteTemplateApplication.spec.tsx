// @vitest-environment jsdom
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ApplyHotsiteTemplateResponse,
  HotsiteAdminContentResponse,
  HotsiteModuleResponse,
} from '@ikaro/types';
import {
  applyHotsiteTemplate,
  listHotsiteTemplates,
} from '@/features/platform/api/tenant-settings';
import { makeTemplateSummaries } from './templates-controller.fixture';
import { useHotsiteTemplateApplication } from './useHotsiteTemplateApplication';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  applyHotsiteTemplate: vi.fn(),
  listHotsiteTemplates: vi.fn(),
}));
vi.mock('@/providers/tenant-provider', () => ({
  useTenant: () => ({ tenantId: 'tenant-1', tenantSlug: 'acme' }),
}));

const TENANT = 'tenant-1';
const BASE = 'https://storage.example.com/ikaro-public-staging';

function hero(title: string, backgroundImageUrl = ''): HotsiteModuleResponse {
  return { type: 'HERO', enabled: true, data: { title, backgroundImageUrl } };
}

function draftOf(layout: HotsiteModuleResponse[]): HotsiteAdminContentResponse {
  return {
    branding: { primaryColor: '#111111', logoUrl: '' },
    layout,
    seo: { title: null, description: null, ogImageUrl: '' },
    updatedAt: '2026-10-24T00:00:00.000Z',
    isPublished: false,
  } as unknown as HotsiteAdminContentResponse;
}

function responseFor(
  id: ApplyHotsiteTemplateResponse['appliedTemplate']['id'],
  title: string,
  appliedSampleTestimonials = false,
): ApplyHotsiteTemplateResponse {
  return {
    content: {
      branding: { primaryColor: '#abcdef', logoUrl: '' },
      layout: [hero(title)],
      seo: { title: null, description: null, ogImageUrl: '' },
    },
    appliedTemplate: { id, version: 1 },
    appliedSampleTestimonials,
  } as unknown as ApplyHotsiteTemplateResponse;
}

function setup(initial: HotsiteAdminContentResponse = draftOf([hero('original')])) {
  const onDraftChanged = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const rendered = renderHook(
    () => {
      const [draft, setDraft] = useState(initial);
      const controller = useHotsiteTemplateApplication({
        draft,
        setDraft,
        tenantId: TENANT,
        onDraftChanged,
      });
      return { draft, setDraft, controller };
    },
    { wrapper },
  );
  return { ...rendered, onDraftChanged };
}

beforeEach(() => {
  vi.mocked(applyHotsiteTemplate).mockReset();
  vi.mocked(listHotsiteTemplates).mockReset();
  vi.mocked(listHotsiteTemplates).mockResolvedValue(makeTemplateSummaries());
});

describe('useHotsiteTemplateApplication', () => {
  describe('the catalogue', () => {
    it('exposes the loaded templates', async () => {
      const { result } = setup();

      expect(result.current.controller.isLoading).toBe(true);
      await waitFor(() => expect(result.current.controller.templates).toHaveLength(6));
    });

    it('exposes a failed load, and reload fetches again', async () => {
      vi.mocked(listHotsiteTemplates).mockRejectedValueOnce(new Error('boom'));
      const { result } = setup();
      await waitFor(() => expect(result.current.controller.isError).toBe(true));

      act(() => result.current.controller.reload());

      await waitFor(() => expect(result.current.controller.templates).toHaveLength(6));
    });
  });

  describe('apply', () => {
    it('sends the draft as storage paths and replaces only its presentation', async () => {
      vi.mocked(applyHotsiteTemplate).mockResolvedValue(responseFor('casa47', 'Casa'));
      const { result, onDraftChanged } = setup(
        draftOf([hero('original', `${BASE}/shared/hotsite-templates/origem/v1/hero.webp`)]),
      );

      act(() => result.current.controller.apply('casa47'));

      await waitFor(() => expect(result.current.controller.appliedTemplateId).toBe('casa47'));
      const [templateId, body] = vi.mocked(applyHotsiteTemplate).mock.calls[0];
      expect(templateId).toBe('casa47');
      expect(body.content.layout[0].data.backgroundImageUrl).toBe(
        'shared/hotsite-templates/origem/v1/hero.webp',
      );
      expect(result.current.draft.layout[0].data.title).toBe('Casa');
      expect(result.current.draft.isPublished).toBe(false);
      expect(result.current.controller.canUndo).toBe(true);
      expect(onDraftChanged).toHaveBeenCalledTimes(1);
    });

    it('reports the sample testimonials the template brought', async () => {
      vi.mocked(applyHotsiteTemplate).mockResolvedValue(responseFor('origem', 'O', true));
      const { result } = setup();

      act(() => result.current.controller.apply('origem'));

      await waitFor(() => expect(result.current.controller.showSampleNotice).toBe(true));
    });

    it('shows no notice when the template brought none', async () => {
      vi.mocked(applyHotsiteTemplate).mockResolvedValue(responseFor('origem', 'O', false));
      const { result } = setup();

      act(() => result.current.controller.apply('origem'));

      await waitFor(() => expect(result.current.controller.appliedTemplateId).toBe('origem'));
      expect(result.current.controller.showSampleNotice).toBe(false);
    });

    it('is busy while pending, naming the template, and ignores a second click', async () => {
      let resolve: (value: ApplyHotsiteTemplateResponse) => void = () => undefined;
      vi.mocked(applyHotsiteTemplate).mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const { result } = setup();

      act(() => result.current.controller.apply('casa47'));
      await waitFor(() => expect(result.current.controller.isApplying).toBe(true));
      expect(result.current.controller.applyingTemplateId).toBe('casa47');
      act(() => result.current.controller.apply('origem'));

      expect(applyHotsiteTemplate).toHaveBeenCalledTimes(1);
      await act(async () => resolve(responseFor('casa47', 'Casa')));
      await waitFor(() => expect(result.current.controller.isApplying).toBe(false));
    });

    // The response can arrive after the manager kept editing; the undo step must hold what the
    // draft really was, not what it was when the card was clicked.
    it('snapshots the draft as it is when the response arrives', async () => {
      let resolve: (value: ApplyHotsiteTemplateResponse) => void = () => undefined;
      vi.mocked(applyHotsiteTemplate).mockReturnValue(
        new Promise((r) => {
          resolve = r;
        }),
      );
      const { result } = setup();
      act(() => result.current.controller.apply('casa47'));
      await waitFor(() => expect(result.current.controller.isApplying).toBe(true));

      act(() => result.current.setDraft((current) => ({ ...current, layout: [hero('editado')] })));
      await act(async () => resolve(responseFor('casa47', 'Casa')));
      await waitFor(() => expect(result.current.controller.canUndo).toBe(true));
      act(() => result.current.controller.undo());

      expect(result.current.draft.layout[0].data.title).toBe('editado');
    });
  });

  describe('replacing the manager’s own uploads', () => {
    const OWN = draftOf([hero('original', `tenants/${TENANT}/hotsite/hero/mine.png`)]);

    it('asks first, and does not call the API yet', () => {
      const { result } = setup(OWN);

      act(() => result.current.controller.apply('casa47'));

      expect(result.current.controller.replaceConfirmOpen).toBe(true);
      expect(applyHotsiteTemplate).not.toHaveBeenCalled();
    });

    it('applies once confirmed', async () => {
      vi.mocked(applyHotsiteTemplate).mockResolvedValue(responseFor('casa47', 'Casa'));
      const { result } = setup(OWN);
      act(() => result.current.controller.apply('casa47'));

      act(() => result.current.controller.confirmReplace());

      await waitFor(() => expect(result.current.controller.appliedTemplateId).toBe('casa47'));
      expect(result.current.controller.replaceConfirmOpen).toBe(false);
    });

    // Negative guarantee: Cancel leaves the draft reference-equal and calls nothing.
    it('leaves everything untouched when cancelled', () => {
      const { result } = setup(OWN);
      const before = result.current.draft;
      act(() => result.current.controller.apply('casa47'));

      act(() => result.current.controller.cancelReplace());

      expect(result.current.draft).toBe(before);
      expect(result.current.controller.replaceConfirmOpen).toBe(false);
      expect(applyHotsiteTemplate).not.toHaveBeenCalled();
    });

    it('does not ask when the only uploads are in the gallery', async () => {
      vi.mocked(applyHotsiteTemplate).mockResolvedValue(responseFor('casa47', 'Casa'));
      const { result } = setup(
        draftOf([
          {
            type: 'GALLERY',
            enabled: true,
            data: {
              images: [{ url: `tenants/${TENANT}/hotsite/gallery/1.png`, source: 'upload' }],
            },
          },
        ]),
      );

      act(() => result.current.controller.apply('casa47'));

      expect(result.current.controller.replaceConfirmOpen).toBe(false);
      await waitFor(() => expect(applyHotsiteTemplate).toHaveBeenCalledTimes(1));
    });
  });

  describe('a failed apply', () => {
    // Negative guarantee: the draft stays reference-equal and no undo step is created.
    it('leaves the draft untouched and creates no undo step', async () => {
      vi.mocked(applyHotsiteTemplate).mockRejectedValue(new Error('boom'));
      const { result, onDraftChanged } = setup();
      const before = result.current.draft;

      act(() => result.current.controller.apply('casa47'));

      await waitFor(() => expect(result.current.controller.applyFailed).toBe(true));
      expect(result.current.draft).toBe(before);
      expect(result.current.controller.canUndo).toBe(false);
      expect(result.current.controller.appliedTemplateId).toBeNull();
      expect(onDraftChanged).not.toHaveBeenCalled();
    });

    it('retries the same template', async () => {
      vi.mocked(applyHotsiteTemplate)
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(responseFor('casa47', 'Casa'));
      const { result } = setup();
      act(() => result.current.controller.apply('casa47'));
      await waitFor(() => expect(result.current.controller.applyFailed).toBe(true));

      act(() => result.current.controller.retryApply());

      await waitFor(() => expect(result.current.controller.appliedTemplateId).toBe('casa47'));
      expect(result.current.controller.applyFailed).toBe(false);
      expect(vi.mocked(applyHotsiteTemplate).mock.calls.map(([id]) => id)).toEqual([
        'casa47',
        'casa47',
      ]);
    });
  });

  describe('undo', () => {
    async function applied() {
      vi.mocked(applyHotsiteTemplate).mockResolvedValue(responseFor('casa47', 'Casa'));
      const harness = setup(draftOf([hero('original')]));
      act(() => harness.result.current.controller.apply('casa47'));
      await waitFor(() => expect(harness.result.current.controller.canUndo).toBe(true));
      return harness;
    }

    it('restores the pre-apply presentation at once when nothing was edited since', async () => {
      const { result, onDraftChanged } = await applied();
      onDraftChanged.mockClear();

      act(() => result.current.controller.undo());

      expect(result.current.draft.layout[0].data.title).toBe('original');
      expect(result.current.controller.undoConfirmOpen).toBe(false);
      expect(result.current.controller.canUndo).toBe(false);
      expect(result.current.controller.appliedTemplateId).toBeNull();
      expect(onDraftChanged).toHaveBeenCalledTimes(1);
    });

    // Negative guarantee: an edit made since would be discarded, so the manager is asked first.
    it('asks first when the draft was edited since the apply, and Cancel keeps the edit', async () => {
      const { result } = await applied();
      act(() => result.current.setDraft((c) => ({ ...c, layout: [hero('depois do template')] })));

      act(() => result.current.controller.undo());
      expect(result.current.controller.undoConfirmOpen).toBe(true);
      expect(result.current.draft.layout[0].data.title).toBe('depois do template');

      act(() => result.current.controller.cancelUndo());
      expect(result.current.controller.undoConfirmOpen).toBe(false);
      expect(result.current.controller.canUndo).toBe(true);
      expect(result.current.draft.layout[0].data.title).toBe('depois do template');
    });

    it('restores the pre-apply presentation once the discard is confirmed', async () => {
      const { result } = await applied();
      act(() => result.current.setDraft((c) => ({ ...c, layout: [hero('depois do template')] })));
      act(() => result.current.controller.undo());

      act(() => result.current.controller.confirmUndo());

      expect(result.current.draft.layout[0].data.title).toBe('original');
      expect(result.current.controller.undoConfirmOpen).toBe(false);
      expect(result.current.controller.canUndo).toBe(false);
    });

    it('a second apply replaces the step: Undo goes back one apply, not two', async () => {
      const { result } = await applied();
      vi.mocked(applyHotsiteTemplate).mockResolvedValue(responseFor('origem', 'Origem'));

      act(() => result.current.controller.apply('origem'));
      await waitFor(() => expect(result.current.controller.appliedTemplateId).toBe('origem'));
      act(() => result.current.controller.undo());

      expect(result.current.draft.layout[0].data.title).toBe('Casa');
    });

    it('is cleared when the editor says so (a successful publish)', async () => {
      const { result } = await applied();

      act(() => result.current.controller.clearUndo());

      expect(result.current.controller.canUndo).toBe(false);
    });

    it('does nothing when there is no step', () => {
      const { result, onDraftChanged } = setup();

      act(() => result.current.controller.undo());

      expect(result.current.controller.undoConfirmOpen).toBe(false);
      expect(onDraftChanged).not.toHaveBeenCalled();
    });
  });
});
