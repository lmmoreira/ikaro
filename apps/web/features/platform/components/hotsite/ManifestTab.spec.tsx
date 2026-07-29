// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ManifestTab } from './ManifestTab';
import type { ManifestDraft } from '@/features/platform/hotsite/manifest-schema';

const VALID_MANIFEST: ManifestDraft = {
  branding: {
    primaryColor: '#F5A800',
    secondaryColor: '#1A1A1A',
    backgroundColor: '#0A0A0A',
    textColor: '#FFFFFF',
    headingFontFamily: 'Montserrat',
    bodyFontFamily: 'Montserrat',
    logoUrl: '',
    borderRadius: 'rounded',
    buttonStyle: 'filled',
    spacing: 'comfortable',
    shadowStyle: 'subtle',
  },
  layout: [
    {
      type: 'HERO',
      enabled: true,
      data: { variant: 'centered', title: 'Bem-vindo', ctaLabel: 'Ver', ctaTarget: 'service-list' },
    },
  ],
  seo: { title: null, description: null, ogImageUrl: '' },
};

describe('ManifestTab', () => {
  it('seeds the textarea with the pretty-printed current draft on mount', () => {
    renderWithIntl(<ManifestTab value={VALID_MANIFEST} onApply={vi.fn()} />);

    const textarea = screen.getByTestId('hotsite-manifest-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toContain('"primaryColor": "#F5A800"');
    expect(textarea.value).toContain('"type": "HERO"');
  });

  it('calls onApply once with the parsed value when Aplicar succeeds', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<ManifestTab value={VALID_MANIFEST} onApply={onApply} />);

    await user.click(screen.getByTestId('hotsite-manifest-apply'));

    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0][0] as ManifestDraft;
    expect(applied.branding.primaryColor).toBe('#F5A800');
    expect(applied.layout).toHaveLength(8);
  });

  it('shows an inline error and does not call onApply when the JSON is invalid', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<ManifestTab value={VALID_MANIFEST} onApply={onApply} />);

    const textarea = screen.getByTestId('hotsite-manifest-textarea');
    fireEvent.change(textarea, { target: { value: '{ not valid json' } });
    await user.click(screen.getByTestId('hotsite-manifest-apply'));

    expect(screen.getByTestId('hotsite-manifest-error')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('never calls onApply just from editing the textarea, without clicking Aplicar', async () => {
    const onApply = vi.fn();
    const user = userEvent.setup();
    renderWithIntl(<ManifestTab value={VALID_MANIFEST} onApply={onApply} />);

    await user.type(screen.getByTestId('hotsite-manifest-textarea'), 'x');

    expect(onApply).not.toHaveBeenCalled();
  });

  it('clears a previously shown error once the user edits the text again', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ManifestTab value={VALID_MANIFEST} onApply={vi.fn()} />);

    const textarea = screen.getByTestId('hotsite-manifest-textarea');
    fireEvent.change(textarea, { target: { value: '{ not valid json' } });
    await user.click(screen.getByTestId('hotsite-manifest-apply'));
    expect(screen.getByTestId('hotsite-manifest-error')).toBeInTheDocument();

    await user.type(textarea, '"');

    expect(screen.queryByTestId('hotsite-manifest-error')).not.toBeInTheDocument();
  });
});
