// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { createAttachmentSignedUrl } from '@/features/booking/api/public';
import { AfterServicePhotoUpload } from './AfterServicePhotoUpload';

vi.mock('@/features/booking/api/public', () => ({
  createAttachmentSignedUrl: vi.fn(),
}));

function makeFile(name: string, type: string): File {
  return new File(['fake-image-content'], name, { type });
}

describe('AfterServicePhotoUpload', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.mocked(createAttachmentSignedUrl).mockReset();
  });

  it('uploads a selected photo and calls onChange with the resulting filePath', async () => {
    const user = userEvent.setup();
    vi.mocked(createAttachmentSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/uploads/photo.jpg',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const onChange = vi.fn();

    renderWithIntl(
      <AfterServicePhotoUpload
        slug="lavacar-beloauto"
        label="Depois do serviço"
        value={[]}
        onChange={onChange}
      />,
    );

    await user.upload(
      screen.getByLabelText('Depois do serviço'),
      makeFile('photo.jpg', 'image/jpeg'),
    );

    expect(await screen.findByText('Enviada')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'photo.jpg' })).toHaveAttribute(
      'src',
      expect.stringContaining('blob:'),
    );
    expect(onChange).toHaveBeenCalledWith(['tenants/tenant-1/uploads/photo.jpg']);
    expect(fetchSpy).toHaveBeenCalledWith('https://storage.example.com/upload?sig=abc', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: expect.any(File),
      signal: expect.any(AbortSignal),
    });
  });

  it('removes the thumbnail and calls onChange without the removed filePath', async () => {
    const user = userEvent.setup();
    vi.mocked(createAttachmentSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/uploads/photo.jpg',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const onChange = vi.fn();

    renderWithIntl(
      <AfterServicePhotoUpload
        slug="lavacar-beloauto"
        label="Depois do serviço"
        value={[]}
        onChange={onChange}
      />,
    );

    await user.upload(
      screen.getByLabelText('Depois do serviço'),
      makeFile('photo.jpg', 'image/jpeg'),
    );
    await screen.findByText('Enviada');

    await user.click(screen.getByRole('button', { name: 'Remover' }));

    expect(screen.queryByRole('img', { name: 'photo.jpg' })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
