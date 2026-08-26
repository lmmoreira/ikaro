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
  it('persists lead-form teaser and questions through the consolidated mutation only', async () => {
    const updateConfig = { mutateAsync: vi.fn() };
    const updateLeadFormConfig = { mutateAsync: vi.fn().mockResolvedValue({}) };
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
      updateLeadFormConfig,
      publishHotsite,
      setDraft,
      onTabs,
      onBanner,
    });

    expect(updateConfig.mutateAsync).not.toHaveBeenCalled();
    expect(updateLeadFormConfig.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceMode: 'GUEST_AND_CUSTOMER',
        questions: [],
        layout: [expect.objectContaining({ data: { title: 'Fale conosco' } })],
      }),
    );
    expect(publishHotsite.mutateAsync).toHaveBeenCalledOnce();
    expect(onBanner).toHaveBeenCalledWith({ kind: 'publish', status: 'success' });
  });
});
