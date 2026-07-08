// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import {
  deleteHotsiteImage,
  generateHotsiteImageSignedUrl,
} from '@/features/platform/tenant-settings';
import { SingleImageUploadField } from './SingleImageUploadField';

vi.mock('@/features/platform/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

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
    vi.mocked(deleteHotsiteImage).mockReset();
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
    process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL = 'http://localhost:4443/ikaro-local-public';

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

  it('shows a retry-oriented error message when the upload fails', async () => {
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

    expect(await screen.findByTestId('single-image-upload-error')).toBeInTheDocument();
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
