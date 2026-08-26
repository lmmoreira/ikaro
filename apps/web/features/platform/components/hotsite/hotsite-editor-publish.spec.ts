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
    const onTabs = vi.fn();
    const onBanner = vi.fn();

    await executeHotsitePublish({
      content,
      leadFormConfig: { audienceMode: 'GUEST_AND_CUSTOMER', questions: [] },
      tenantId: 'tenant-1',
      locale: 'pt-BR',
      updateConfig,
      publishHotsite,
      setDraft,
      onTabs,
      onBanner,
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
  });

  it('omits audienceMode/questions entirely when publishing a non-LEAD_FORM edit', async () => {
    const updateConfig = { mutateAsync: vi.fn().mockResolvedValue({ ...content }) };
    const publishHotsite = { mutateAsync: vi.fn().mockResolvedValue({}) };
    const setDraft = vi.fn();
    const onTabs = vi.fn();
    const onBanner = vi.fn();

    await executeHotsitePublish({
      content,
      leadFormConfig: null,
      tenantId: 'tenant-1',
      locale: 'pt-BR',
      updateConfig,
      publishHotsite,
      setDraft,
      onTabs,
      onBanner,
    });

    const [body] = updateConfig.mutateAsync.mock.calls[0]!;
    expect(body).not.toHaveProperty('audienceMode');
    expect(body).not.toHaveProperty('questions');
    // No lead-form config, so the LEAD_FORM layout entry passes through untouched (still
    // carrying whatever draft.layout already had, unstripped).
    expect(body.layout).toBe(content.layout);
  });
});
