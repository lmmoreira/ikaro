// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ModuleConfigPreviewScreen } from './ModuleConfigPreviewScreen';

// HotsitePreview has its own spec; here it only needs to expose the draft it was given and a
// publish control, so the screen's own decisions can be asserted.
vi.mock('./hotsite-editor-lazy-panels', () => ({
  HotsitePreview: ({
    draft,
    onPublish,
    isPublishing,
  }: {
    draft: HotsiteAdminContentResponse;
    onPublish: () => void;
    isPublishing: boolean;
  }) => (
    <div>
      <pre data-testid="preview-layout">{JSON.stringify(draft.layout)}</pre>
      <button
        type="button"
        data-testid="preview-publish"
        disabled={isPublishing}
        onClick={onPublish}
      >
        publish
      </button>
    </div>
  ),
}));

const DRAFT = {
  branding: {},
  layout: [
    { type: 'CONTACT', enabled: true, data: { title: 'Antes' } },
    { type: 'LEAD_FORM', enabled: true, data: { title: 'Olá' } },
  ],
  seo: {},
  updatedAt: '2026-10-22T00:00:00.000Z',
  isPublished: false,
} as unknown as HotsiteAdminContentResponse;

function renderScreen(overrides: Partial<React.ComponentProps<typeof ModuleConfigPreviewScreen>>) {
  const props = {
    draft: DRAFT,
    type: 'CONTACT',
    localData: { title: 'Depois' },
    isPublishing: false,
    onPublish: vi.fn(),
    onPublishBlocked: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof ModuleConfigPreviewScreen>;
  return { ...renderWithIntl(<ModuleConfigPreviewScreen {...props} />), props };
}

describe('ModuleConfigPreviewScreen', () => {
  it("previews the draft with the module's unapplied edits merged in", () => {
    renderScreen({});

    expect(screen.getByTestId('preview-layout')).toHaveTextContent('"title":"Depois"');
    expect(screen.getByTestId('preview-layout')).toHaveTextContent('"title":"Olá"');
  });

  it('publishes the merged content', async () => {
    const user = userEvent.setup();
    const { props } = renderScreen({});

    await user.click(screen.getByTestId('preview-publish'));

    expect(props.onPublish).toHaveBeenCalledTimes(1);
    const [content, leadForm] = vi.mocked(props.onPublish).mock.calls[0]!;
    expect(content.layout[0]?.data).toEqual({ title: 'Depois' });
    expect(leadForm).toBeUndefined();
  });

  it('passes a valid LEAD_FORM config along with the merged content', async () => {
    const user = userEvent.setup();
    const config = { audienceMode: 'CUSTOMER_ONLY', questions: [] };
    const { props } = renderScreen({ type: 'LEAD_FORM', localData: { title: 'Olá', ...config } });

    await user.click(screen.getByTestId('preview-publish'));

    expect(props.onPublish).toHaveBeenCalledWith(expect.anything(), config);
    expect(props.onPublishBlocked).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an invalid question',
      {
        audienceMode: 'CUSTOMER_ONLY',
        questions: [{ id: 'q1', label: '', type: 'TEXT', required: false, order: 0 }],
      },
    ],
    ['no LeadFormConfig portion', { title: 'Olá' }],
  ])('blocks publishing a LEAD_FORM with %s and publishes nothing', async (_label, localData) => {
    const user = userEvent.setup();
    const { props } = renderScreen({ type: 'LEAD_FORM', localData });

    await user.click(screen.getByTestId('preview-publish'));

    expect(props.onPublishBlocked).toHaveBeenCalledTimes(1);
    expect(props.onPublish).not.toHaveBeenCalled();
  });

  it('disables publishing while a publish is in flight', () => {
    renderScreen({ isPublishing: true });

    expect(screen.getByTestId('preview-publish')).toBeDisabled();
  });
});
