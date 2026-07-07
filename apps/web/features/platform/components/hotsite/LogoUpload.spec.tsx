// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { generateHotsiteImageSignedUrl } from '@/features/platform/tenant-settings';
import { LogoUpload } from './LogoUpload';

vi.mock('@/features/platform/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
}));

function makeFile(name: string, type: string): File {
  return new File(['fake-image-content'], name, { type });
}

describe('LogoUpload', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.mocked(generateHotsiteImageSignedUrl).mockReset();
  });

  it('uploads a selected logo and calls onChange with the resulting filePath', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/logo.png',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const onChange = vi.fn();

    renderWithIntl(<LogoUpload value="" onChange={onChange} />);

    await user.upload(
      screen.getByTestId('hotsite-logo-upload-input'),
      makeFile('logo.png', 'image/png'),
    );

    expect(onChange).toHaveBeenCalledWith('tenants/tenant-1/hotsite/logo.png');
    expect(generateHotsiteImageSignedUrl).toHaveBeenCalledWith({
      fileName: 'logo.png',
      contentType: 'image/png',
      purpose: 'branding',
    });
    expect(fetchSpy).toHaveBeenCalledWith('https://storage.example.com/upload?sig=abc', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: expect.any(File),
    });
    // The resolved filePath is a bucket-relative storage path, not a displayable URL — the
    // preview must come from a local blob URL, not the raw onChange value.
    expect(screen.getByTestId('hotsite-logo-preview')).toHaveAttribute(
      'src',
      expect.stringContaining('blob:'),
    );
  });

  it('shows a retry-oriented error message when the upload fails, no URL fallback field', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockRejectedValue(new Error('network error'));
    const onChange = vi.fn();

    renderWithIntl(<LogoUpload value="" onChange={onChange} />);

    await user.upload(
      screen.getByTestId('hotsite-logo-upload-input'),
      makeFile('logo.png', 'image/png'),
    );

    expect(await screen.findByTestId('hotsite-logo-upload-error')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('renders the current logo as a preview when a value is present', () => {
    renderWithIntl(<LogoUpload value="https://cdn.example.com/logo.png" onChange={vi.fn()} />);

    expect(screen.getByTestId('hotsite-logo-preview')).toHaveAttribute(
      'src',
      'https://cdn.example.com/logo.png',
    );
  });
});
