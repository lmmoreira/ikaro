// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import {
  deleteHotsiteImage,
  generateHotsiteImageSignedUrl,
} from '@/features/platform/api/tenant-settings';
import { LogoUpload } from './LogoUpload';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

function makeFile(name: string, type: string): File {
  return new File(['fake-image-content'], name, { type });
}

// LogoUpload is a thin wrapper over SingleImageUploadField — the upload/preview/error mechanics
// themselves are covered there. These tests only verify the branding-specific wiring: purpose,
// small preview size, translated labels, and that a fresh upload + remove round-trip works.
describe('LogoUpload', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.mocked(generateHotsiteImageSignedUrl).mockReset();
    vi.mocked(deleteHotsiteImage).mockReset();
  });

  it('uploads a selected logo with purpose "branding" and calls onChange with the resulting filePath', async () => {
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
      screen.getByTestId('single-image-upload-input'),
      makeFile('logo.png', 'image/png'),
    );

    expect(generateHotsiteImageSignedUrl).toHaveBeenCalledWith({
      fileName: 'logo.png',
      contentType: 'image/png',
      purpose: 'branding',
    });
    expect(onChange).toHaveBeenCalledWith('tenants/tenant-1/hotsite/logo.png');
    // Small preview size — logoUrl is only ever displayed as a 64px icon (login page), not a banner.
    expect(screen.getByTestId('single-image-upload-preview').className).toContain('h-16');
  });

  it('renders the current logo as a preview when a value is present', () => {
    renderWithIntl(<LogoUpload value="https://cdn.example.com/logo.png" onChange={vi.fn()} />);

    expect(screen.getByTestId('single-image-upload-preview')).toHaveAttribute(
      'src',
      'https://cdn.example.com/logo.png',
    );
  });

  it('removing a freshly-uploaded logo calls deleteHotsiteImage and clears onChange', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteHotsiteImage).mockResolvedValue(undefined);
    const onChange = vi.fn();

    renderWithIntl(
      <LogoUpload value="tenants/tenant-1/hotsite/branding/u1/logo.png" onChange={onChange} />,
    );

    await user.click(screen.getByTestId('single-image-upload-remove'));

    expect(deleteHotsiteImage).toHaveBeenCalledWith(
      'tenants/tenant-1/hotsite/branding/u1/logo.png',
    );
    expect(onChange).toHaveBeenCalledWith('');
  });
});
