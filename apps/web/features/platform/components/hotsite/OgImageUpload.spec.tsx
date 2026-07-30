// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import {
  deleteHotsiteImage,
  generateHotsiteImageSignedUrl,
} from '@/features/platform/api/tenant-settings';
import { OgImageUpload } from './OgImageUpload';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

// jsdom has no createImageBitmap/canvas — compressImage() now throws when a required crop can't
// be produced (M18-S03 review fix), which would otherwise turn every upload here into an error
// state. This wrapper's tests only cover purpose/preview-size/label wiring, not compression
// itself (that's compress-image.spec.ts's job) — mocked as a passthrough like
// SingleImageUploadField.spec.tsx already does.
vi.mock('@/shared/utils/compress-image', () => ({
  compressImage: vi.fn((file: File) => Promise.resolve(file)),
}));

function makeFile(name: string, type: string): File {
  return new File(['fake-image-content'], name, { type });
}

// OgImageUpload is a thin wrapper over SingleImageUploadField, mirroring LogoUpload.tsx's shape —
// the upload/preview/error mechanics themselves are covered there. These tests only verify the
// seo-og-image-specific wiring: purpose, large (landscape) preview size, translated labels, and
// that a fresh upload + remove round-trip works.
describe('OgImageUpload', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.mocked(generateHotsiteImageSignedUrl).mockReset();
    vi.mocked(deleteHotsiteImage).mockReset();
  });

  it('uploads a selected image with purpose "seo-og-image" and calls onChange with the resulting filePath', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/og-image.png',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const onChange = vi.fn();

    renderWithIntl(<OgImageUpload value="" onChange={onChange} />);

    await user.upload(
      screen.getByTestId('single-image-upload-input'),
      makeFile('share.png', 'image/png'),
    );

    expect(generateHotsiteImageSignedUrl).toHaveBeenCalledWith({
      fileName: 'share.png',
      contentType: 'image/png',
      purpose: 'seo-og-image',
    });
    expect(onChange).toHaveBeenCalledWith('tenants/tenant-1/hotsite/og-image.png');
    // Large preview size — a share image is a landscape banner, not a small icon like the logo.
    expect(screen.getByTestId('single-image-upload-preview').className).toContain('max-h-48');
  });

  it('renders the current image as a preview when a value is present', () => {
    renderWithIntl(
      <OgImageUpload value="https://cdn.example.com/og-image.png" onChange={vi.fn()} />,
    );

    expect(screen.getByTestId('single-image-upload-preview')).toHaveAttribute(
      'src',
      'https://cdn.example.com/og-image.png',
    );
  });

  it('removing a freshly-uploaded image calls deleteHotsiteImage and clears onChange', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteHotsiteImage).mockResolvedValue(undefined);
    const onChange = vi.fn();

    renderWithIntl(
      <OgImageUpload
        value="tenants/tenant-1/hotsite/seo-og-image/u1/share.png"
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId('single-image-upload-remove'));

    expect(deleteHotsiteImage).toHaveBeenCalledWith(
      'tenants/tenant-1/hotsite/seo-og-image/u1/share.png',
    );
    expect(onChange).toHaveBeenCalledWith('');
  });
});
