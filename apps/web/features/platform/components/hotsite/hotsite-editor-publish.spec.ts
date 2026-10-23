// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { executeHotsitePublish } from './hotsite-editor-publish';

vi.mock('@/features/platform/hotsite/strip-resolved-image-urls', () => ({
  stripResolvedImageUrls: vi.fn((branding, layout, seo) => ({ branding, layout, seo })),
}));

const content = {
  branding: {},
  layout: [
    {
      type: 'LEAD_FORM',
      enabled: true,
      data: { title: 'Fale conosco', audienceMode: 'GUEST_AND_CUSTOMER', questions: [] },
    },
  ],
  seo: {},
  updatedAt: '2026-08-26T00:00:00.000Z',
  isPublished: false,
} as unknown as HotsiteAdminContentResponse;

describe('executeHotsitePublish', () => {
  it('sends audienceMode/questions on the one consolidated mutation, with the LEAD_FORM layout entry stripped of them', async () => {
    const updateConfig = { mutateAsync: vi.fn().mockResolvedValue({ ...content }) };
    const publishHotsite = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const setDraft = vi.fn();
    const onSettled = vi.fn();
    const onBanner = vi.fn();
    const onLeadFormPublished = vi.fn();

    await executeHotsitePublish({
      content,
      leadFormConfig: { audienceMode: 'GUEST_AND_CUSTOMER', questions: [] },
      tenantId: 'tenant-1',
      locale: 'pt-BR',
      updateConfig,
      publishHotsite,
      setDraft,
      onSettled,
      onBanner,
      onLeadFormPublished,
    });

    expect(updateConfig.mutateAsync).toHaveBeenCalledTimes(1);
    expect(updateConfig.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceMode: 'GUEST_AND_CUSTOMER',
        questions: [],
        // audienceMode/questions must never ride along inside layout[]'s own data blob — that's
        // the public-manifest-cached shape, admin-only fields belong only at the top level.
        layout: [expect.objectContaining({ data: { title: 'Fale conosco' } })],
      }),
    );
    expect(publishHotsite.mutateAsync).toHaveBeenCalledOnce();
    expect(onBanner).toHaveBeenCalledWith({ kind: 'publish', status: 'success' });
    // Clears HotsiteEditor's leadFormConfigDraft so a later, unrelated publish doesn't keep
    // re-sending this now-stale snapshot (M20-S08 PR #429 Codex review finding, 2026-08-26).
    expect(onLeadFormPublished).toHaveBeenCalledOnce();
  });

  // The PATCH body is rebuilt from the draft layout; a module's presentation (a sibling
  // of data) must ride along, or every save through the editor would silently erase it.
  it('sends a module presentation unchanged on the consolidated mutation', async () => {
    const presentation = { surface: 'custom', customColor: '#0B0908', minHeight: 'lg' };
    const withPresentation = {
      ...content,
      layout: [
        {
          type: 'ABOUT',
          enabled: true,
          data: { title: 'T', body: 'B', imagePosition: 'left' },
          presentation,
        },
      ],
    } as unknown as HotsiteAdminContentResponse;
    const updateConfig = { mutateAsync: vi.fn().mockResolvedValue({ ...withPresentation }) };

    await executeHotsitePublish({
      content: withPresentation,
      leadFormConfig: null,
      tenantId: 'tenant-1',
      locale: 'pt-BR',
      updateConfig,
      publishHotsite: { mutateAsync: vi.fn().mockResolvedValue({}) },
      setDraft: vi.fn(),
      onSettled: vi.fn(),
      onBanner: vi.fn(),
      onLeadFormPublished: vi.fn(),
    });

    expect(updateConfig.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ layout: [expect.objectContaining({ presentation })] }),
    );
  });

  it('omits audienceMode/questions entirely when publishing a non-LEAD_FORM edit', async () => {
    const updateConfig = { mutateAsync: vi.fn().mockResolvedValue({ ...content }) };
    const publishHotsite = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const setDraft = vi.fn();
    const onSettled = vi.fn();
    const onBanner = vi.fn();
    const onLeadFormPublished = vi.fn();

    await executeHotsitePublish({
      content,
      leadFormConfig: null,
      tenantId: 'tenant-1',
      locale: 'pt-BR',
      updateConfig,
      publishHotsite,
      setDraft,
      onSettled,
      onBanner,
      onLeadFormPublished,
    });

    const [body] = updateConfig.mutateAsync.mock.calls[0]!;
    expect(body).not.toHaveProperty('audienceMode');
    expect(body).not.toHaveProperty('questions');
    // No lead-form config, so the LEAD_FORM layout entry passes through untouched (still
    // carrying whatever draft.layout already had, unstripped).
    expect(body.layout).toBe(content.layout);
    // Called unconditionally, even for a publish with no lead-form edit involved — a no-op on the
    // HotsiteEditor side since leadFormConfigDraft is already null in that case.
    expect(onLeadFormPublished).toHaveBeenCalledOnce();
  });

  function buildArgs(overrides: Partial<Parameters<typeof executeHotsitePublish>[0]> = {}) {
    return {
      content,
      leadFormConfig: null,
      tenantId: 'tenant-1',
      locale: 'pt-BR' as const,
      updateConfig: { mutateAsync: vi.fn().mockResolvedValue({ ...content }) },
      publishHotsite: { mutateAsync: vi.fn().mockResolvedValue({}) },
      setDraft: vi.fn(),
      onSettled: vi.fn(),
      onBanner: vi.fn(),
      onLeadFormPublished: vi.fn(),
      onSaved: vi.fn(),
      ...overrides,
    };
  }

  it('reports the saved draft once the save succeeds, before publishing', async () => {
    const args = buildArgs();

    await executeHotsitePublish(args);

    expect(args.onSaved).toHaveBeenCalledOnce();
    expect(args.onSaved).toHaveBeenCalledWith(expect.objectContaining({ seo: content.seo }));
  });

  it.each([
    [
      'the save fails',
      { updateConfig: { mutateAsync: vi.fn().mockRejectedValue(new Error('x')) } },
    ],
    [
      'the publish fails',
      { publishHotsite: { mutateAsync: vi.fn().mockRejectedValue(new Error('x')) } },
    ],
  ])(
    'settles with an error banner and keeps the lead-form draft when %s',
    async (_name, override) => {
      const args = buildArgs(override);

      await executeHotsitePublish(args);

      expect(args.onSettled).toHaveBeenCalledOnce();
      expect(args.onBanner).toHaveBeenCalledWith(expect.objectContaining({ status: 'error' }));
      expect(args.onLeadFormPublished).not.toHaveBeenCalled();
    },
  );

  it('does not report a saved draft when the save fails', async () => {
    const args = buildArgs({
      updateConfig: { mutateAsync: vi.fn().mockRejectedValue(new Error('x')) },
    });

    await executeHotsitePublish(args);

    expect(args.onSaved).not.toHaveBeenCalled();
  });

  it('settles on success and clears the lead-form draft', async () => {
    const args = buildArgs();

    await executeHotsitePublish(args);

    expect(args.onSettled).toHaveBeenCalledOnce();
    expect(args.onLeadFormPublished).toHaveBeenCalledOnce();
  });
});
