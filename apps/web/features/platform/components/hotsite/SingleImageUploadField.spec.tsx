// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPublicEnv, renderWithIntl, stubPublicEnv } from '@/test-utils';
import {
  deleteHotsiteImage,
  generateHotsiteImageReadSignedUrl,
  generateHotsiteImageSignedUrl,
} from '@/features/platform/api/tenant-settings';
import { ApiError } from '@/shared/lib/api/errors';
import { compressImage, LOW_RESOLUTION_ERROR_MESSAGE } from '@/shared/utils/compress-image';
import { SingleImageUploadField } from './SingleImageUploadField';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  generateHotsiteImageReadSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

// Keeps LOW_RESOLUTION_ERROR_MESSAGE real (not re-declared here) so the component-under-test's own
// import of it stays in sync with what these tests throw — only compressImage itself is mocked.
vi.mock('@/shared/utils/compress-image', async () => {
  const actual = await vi.importActual<typeof import('@/shared/utils/compress-image')>(
    '@/shared/utils/compress-image',
  );
  return {
    ...actual,
    compressImage: vi.fn((file: File) => Promise.resolve(file)),
  };
});

const LABELS = {
  label: 'Imagem de fundo',
  clickToAddLabel: 'Arraste uma imagem ou clique para enviar',
  formatHintLabel: 'PNG ou JPG',
  uploadingLabel: 'Enviando...',
  uploadErrorLabel: 'Não foi possível enviar a imagem.',
  removeLabel: 'Remover',
};

function makeFile(name: string, type: string): File {
  return new File(['fake-image-content'], name, { type });
}

// Static testid + data-field-id (not a template-literal testid) — queried the same way this
// codebase's other per-item lists are (see BookingQueuePage.spec.tsx's booking-card mock).
function getByFieldId(testId: string, fieldId: string): HTMLElement {
  const match = screen.getAllByTestId(testId).find((el) => el.dataset.fieldId === fieldId);
  if (!match) throw new Error(`No element with data-testid="${testId}" data-field-id="${fieldId}"`);
  return match;
}

function queryByFieldId(testId: string, fieldId: string): HTMLElement | null {
  return screen.queryAllByTestId(testId).find((el) => el.dataset.fieldId === fieldId) ?? null;
}

describe('SingleImageUploadField', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.mocked(generateHotsiteImageSignedUrl).mockReset();
    vi.mocked(generateHotsiteImageReadSignedUrl).mockReset();
    vi.mocked(deleteHotsiteImage).mockReset();
    vi.mocked(compressImage).mockReset();
    vi.mocked(compressImage).mockImplementation((file: File) => Promise.resolve(file));
    // The "resolves a raw storage path" case below stubs the injected public env directly —
    // clear it so later tests in this file (or this worker) don't inherit a leftover value.
    clearPublicEnv();
  });

  it('uploads a selected image with the given purpose and calls onChange with the resulting filePath', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/hero/banner.png',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const onChange = vi.fn();

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value=""
        onChange={onChange}
        purpose="hero"
        {...LABELS}
      />,
    );

    await user.upload(
      getByFieldId('single-image-upload-input', 'hero-bg'),
      makeFile('banner.png', 'image/png'),
    );

    expect(generateHotsiteImageSignedUrl).toHaveBeenCalledWith({
      fileName: 'banner.png',
      contentType: 'image/png',
      purpose: 'hero',
    });
    expect(onChange).toHaveBeenCalledWith('tenants/tenant-1/hotsite/hero/banner.png');
    expect(getByFieldId('single-image-upload-preview', 'hero-bg')).toHaveAttribute(
      'src',
      expect.stringContaining('blob:'),
    );
  });

  it('uploads the compressed file returned by compressImage, not the original selection', async () => {
    const user = userEvent.setup();
    const compressedFile = makeFile('banner.webp', 'image/webp');
    vi.mocked(compressImage).mockResolvedValue(compressedFile);
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/hero/banner.webp',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value=""
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );

    await user.upload(
      getByFieldId('single-image-upload-input', 'hero-bg'),
      makeFile('banner.png', 'image/png'),
    );

    await waitFor(() => {
      expect(generateHotsiteImageSignedUrl).toHaveBeenCalledWith({
        fileName: 'banner.webp',
        contentType: 'image/webp',
        purpose: 'hero',
      });
    });
  });

  it('applies the large preview class by default and the small one when previewSize="small"', () => {
    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value="https://cdn.example.com/banner.png"
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );
    expect(getByFieldId('single-image-upload-preview', 'hero-bg').className).toContain('max-h-48');

    renderWithIntl(
      <SingleImageUploadField
        id="logo"
        value="https://cdn.example.com/logo.png"
        onChange={vi.fn()}
        purpose="branding"
        previewSize="small"
        {...LABELS}
      />,
    );
    expect(getByFieldId('single-image-upload-preview', 'logo').className).toContain('h-16');
  });

  it('resolves a raw storage path (re-opened after a save, no fresh local preview) into a displayable absolute URL', () => {
    stubPublicEnv({
      NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL: 'http://localhost:4443/ikaro-local-public',
    });

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value="tenants/tenant-1/hotsite/hero/banner.png"
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );

    expect(getByFieldId('single-image-upload-preview', 'hero-bg')).toHaveAttribute(
      'src',
      'http://localhost:4443/ikaro-local-public/tenants/tenant-1/hotsite/hero/banner.png',
    );
  });

  it('resolves a tmp/ (not-yet-promoted) value via a private read-signed-URL instead of the public base URL', async () => {
    vi.mocked(generateHotsiteImageReadSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/signed-read?sig=abc',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value="tmp/tenant-1/hero/u1/banner.png"
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );

    expect(generateHotsiteImageReadSignedUrl).toHaveBeenCalledWith(
      'tmp/tenant-1/hero/u1/banner.png',
    );
    expect(
      await screen.findByTestId('single-image-upload-preview', {}, { timeout: 3000 }),
    ).toHaveAttribute('src', 'https://storage.example.com/signed-read?sig=abc');
  });

  it("does not show the previous tmp/ value's signed URL while a new tmp/ value is still resolving", async () => {
    vi.mocked(generateHotsiteImageReadSignedUrl).mockResolvedValueOnce({
      signedUrl: 'https://storage.example.com/signed-read-old?sig=old',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });

    const { rerender } = renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value="tmp/tenant-1/hero/u1/old.png"
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );

    expect(
      await screen.findByTestId('single-image-upload-preview', {}, { timeout: 3000 }),
    ).toHaveAttribute('src', 'https://storage.example.com/signed-read-old?sig=old');

    let resolveSecond!: (value: { signedUrl: string; expiresAt: string }) => void;
    vi.mocked(generateHotsiteImageReadSignedUrl).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      }),
    );

    rerender(
      <SingleImageUploadField
        id="hero-bg"
        value="tmp/tenant-1/hero/u2/new.png"
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );

    // The stale old-value signed URL must be cleared immediately, before the new fetch resolves.
    expect(queryByFieldId('single-image-upload-preview', 'hero-bg')).not.toBeInTheDocument();

    resolveSecond({
      signedUrl: 'https://storage.example.com/signed-read-new?sig=new',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });

    expect(
      await screen.findByTestId('single-image-upload-preview', {}, { timeout: 3000 }),
    ).toHaveAttribute('src', 'https://storage.example.com/signed-read-new?sig=new');
  });

  it('shows the caller-provided fallback label for a failure with no recognizable code (e.g. the cloud-storage PUT itself)', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockRejectedValue(new Error('network error'));

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value=""
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );

    await user.upload(
      getByFieldId('single-image-upload-input', 'hero-bg'),
      makeFile('banner.png', 'image/png'),
    );

    expect(await screen.findByTestId('single-image-upload-error')).toHaveTextContent(
      LABELS.uploadErrorLabel,
    );
  });

  it('shows the specific translated message when the signed-url request itself fails with a known code', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockRejectedValue(
      new ApiError(422, 'Invalid', { code: 'PLATFORM_HOTSITE_IMAGE_NOT_UPLOADED' }),
    );

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value=""
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );

    await user.upload(
      getByFieldId('single-image-upload-input', 'hero-bg'),
      makeFile('banner.png', 'image/png'),
    );

    expect(await screen.findByTestId('single-image-upload-error')).toHaveTextContent(
      'A imagem informada não foi encontrada.',
    );
  });

  it('shows the upload-error state when compressImage rejects (e.g. a source too small to crop to the required ratio)', async () => {
    const user = userEvent.setup();
    vi.mocked(compressImage).mockRejectedValue(new Error('Image is too small to crop'));

    renderWithIntl(
      <SingleImageUploadField
        id="logo"
        value=""
        onChange={vi.fn()}
        purpose="branding"
        {...LABELS}
      />,
    );

    await user.upload(
      getByFieldId('single-image-upload-input', 'logo'),
      makeFile('tiny.png', 'image/png'),
    );

    expect(await screen.findByTestId('single-image-upload-error')).toHaveTextContent(
      LABELS.uploadErrorLabel,
    );
  });

  it('shows lowResolutionErrorLabel when compressImage rejects with the low-resolution marker and the caller supplied that label', async () => {
    const user = userEvent.setup();
    vi.mocked(compressImage).mockRejectedValue(new Error(LOW_RESOLUTION_ERROR_MESSAGE));

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value=""
        onChange={vi.fn()}
        purpose="hero"
        lowResolutionErrorLabel="Resolução muito baixa."
        {...LABELS}
      />,
    );

    await user.upload(
      getByFieldId('single-image-upload-input', 'hero-bg'),
      makeFile('wide-banner.png', 'image/png'),
    );

    expect(await screen.findByTestId('single-image-upload-error')).toHaveTextContent(
      'Resolução muito baixa.',
    );
  });

  it('falls back to the generic uploadErrorLabel for a low-resolution rejection when no lowResolutionErrorLabel was supplied', async () => {
    const user = userEvent.setup();
    vi.mocked(compressImage).mockRejectedValue(new Error(LOW_RESOLUTION_ERROR_MESSAGE));

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value=""
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );

    await user.upload(
      getByFieldId('single-image-upload-input', 'hero-bg'),
      makeFile('wide-banner.png', 'image/png'),
    );

    expect(await screen.findByTestId('single-image-upload-error')).toHaveTextContent(
      LABELS.uploadErrorLabel,
    );
  });

  it('removing a freshly-uploaded (raw storage path) image calls deleteHotsiteImage and clears the value', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteHotsiteImage).mockResolvedValue(undefined);
    const onChange = vi.fn();

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value="tenants/tenant-1/hotsite/hero/banner.png"
        onChange={onChange}
        purpose="hero"
        {...LABELS}
      />,
    );

    await user.click(getByFieldId('single-image-upload-remove', 'hero-bg'));

    expect(deleteHotsiteImage).toHaveBeenCalledWith('tenants/tenant-1/hotsite/hero/banner.png');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('removing a not-yet-promoted tmp/ image calls deleteHotsiteImage and clears the value', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageReadSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/signed-read?sig=abc',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    vi.mocked(deleteHotsiteImage).mockResolvedValue(undefined);
    const onChange = vi.fn();

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value="tmp/tenant-1/hero/u1/banner.png"
        onChange={onChange}
        purpose="hero"
        {...LABELS}
      />,
    );

    await user.click(await screen.findByTestId('single-image-upload-remove'));

    expect(deleteHotsiteImage).toHaveBeenCalledWith('tmp/tenant-1/hero/u1/banner.png');
    expect(onChange).toHaveBeenCalledWith('');
  });

  it('removing an already-resolved public URL clears the value without calling deleteHotsiteImage', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value="https://storage.googleapis.com/bucket/tenants/tenant-1/hotsite/hero/banner.png"
        onChange={onChange}
        purpose="hero"
        {...LABELS}
      />,
    );

    await user.click(getByFieldId('single-image-upload-remove', 'hero-bg'));

    expect(deleteHotsiteImage).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith('');
  });

  // M18-S03 — auto center-crop target ratio is derived from `purpose`, not passed explicitly by
  // the caller. Only 'branding' (square, avatar-like) and 'seo-og-image' (landscape share image)
  // have a fixed display shape; every other purpose keeps the pre-existing behavior (no crop).
  it('passes a 1:1 targetAspectRatio to compressImage for purpose="branding"', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/branding/logo.png',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    renderWithIntl(
      <SingleImageUploadField
        id="logo"
        value=""
        onChange={vi.fn()}
        purpose="branding"
        {...LABELS}
      />,
    );

    await user.upload(
      getByFieldId('single-image-upload-input', 'logo'),
      makeFile('logo.png', 'image/png'),
    );

    expect(compressImage).toHaveBeenCalledWith(expect.any(File), 1, undefined);
  });

  it('passes the 1200/630 targetAspectRatio to compressImage for purpose="seo-og-image"', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/seo-og-image/share.png',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    renderWithIntl(
      <SingleImageUploadField
        id="og-image"
        value=""
        onChange={vi.fn()}
        purpose="seo-og-image"
        {...LABELS}
      />,
    );

    await user.upload(
      getByFieldId('single-image-upload-input', 'og-image'),
      makeFile('share.png', 'image/png'),
    );

    expect(compressImage).toHaveBeenCalledWith(expect.any(File), 1200 / 630, undefined);
  });

  it('passes no targetAspectRatio but the 450px minHeight floor to compressImage for purpose="hero"', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/hero/banner.png',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value=""
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );

    await user.upload(
      getByFieldId('single-image-upload-input', 'hero-bg'),
      makeFile('banner.png', 'image/png'),
    );

    expect(compressImage).toHaveBeenCalledWith(expect.any(File), undefined, 450);
  });

  it('does not render a remove button when there is no current value', () => {
    renderWithIntl(
      <SingleImageUploadField
        id="hero-bg"
        value=""
        onChange={vi.fn()}
        purpose="hero"
        {...LABELS}
      />,
    );

    expect(queryByFieldId('single-image-upload-remove', 'hero-bg')).not.toBeInTheDocument();
  });
});
