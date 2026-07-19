// @vitest-environment jsdom
import { renderWithIntl } from '@/test-utils';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCustomerAttachmentSignedUrl } from '../../api';
import { compressImage } from '@/shared/utils/compress-image';
import { CustomerPhotoUpload } from './CustomerPhotoUpload';

vi.mock('../../api', () => ({
  createCustomerAttachmentSignedUrl: vi.fn(),
}));

vi.mock('@/shared/utils/compress-image', () => ({
  compressImage: vi.fn((file: File) => Promise.resolve(file)),
}));

function makeFile(name: string, type: string): File {
  return new File(['fake-image-content'], name, { type });
}

describe('CustomerPhotoUpload', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.mocked(createCustomerAttachmentSignedUrl).mockReset();
    vi.mocked(compressImage).mockReset();
    vi.mocked(compressImage).mockImplementation((file: File) => Promise.resolve(file));
  });

  it('renders the file input and helper text with pt-BR copy', () => {
    renderWithIntl(<CustomerPhotoUpload bookingId="b1" value={[]} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Fotos (opcional)')).toBeInTheDocument();
    expect(screen.getByText('Clique para adicionar fotos')).toBeInTheDocument();
    expect(screen.getByText('JPG ou PNG')).toBeInTheDocument();
  });

  it('uploads a selected photo, shows a thumbnail preview and calls onChange with the resulting filePath', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomerAttachmentSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/bookings/b1/photo.jpg',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const onChange = vi.fn();

    renderWithIntl(<CustomerPhotoUpload bookingId="b1" value={[]} onChange={onChange} />);

    await user.upload(
      screen.getByLabelText('Fotos (opcional)'),
      makeFile('photo.jpg', 'image/jpeg'),
    );

    expect(await screen.findByText('Enviada')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'photo.jpg' })).toHaveAttribute(
      'src',
      expect.stringContaining('blob:'),
    );
    expect(createCustomerAttachmentSignedUrl).toHaveBeenCalledWith('photo.jpg', 'image/jpeg', 'b1');
    expect(onChange).toHaveBeenCalledWith(['tenants/tenant-1/bookings/b1/photo.jpg']);
    expect(fetchSpy).toHaveBeenCalledWith('https://storage.example.com/upload?sig=abc', {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg' },
      body: expect.any(File),
      signal: expect.any(AbortSignal),
    });
  });

  it('uploads the compressed file returned by compressImage, not the original selection', async () => {
    const user = userEvent.setup();
    const compressedFile = makeFile('photo.webp', 'image/webp');
    vi.mocked(compressImage).mockResolvedValue(compressedFile);
    vi.mocked(createCustomerAttachmentSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/bookings/b1/photo.webp',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    renderWithIntl(<CustomerPhotoUpload bookingId="b1" value={[]} onChange={vi.fn()} />);

    await user.upload(
      screen.getByLabelText('Fotos (opcional)'),
      makeFile('photo.jpg', 'image/jpeg'),
    );

    expect(await screen.findByText('Enviada')).toBeInTheDocument();
    expect(createCustomerAttachmentSignedUrl).toHaveBeenCalledWith(
      'photo.webp',
      'image/webp',
      'b1',
    );
  });

  it('removes the thumbnail and calls onChange without the removed filePath', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomerAttachmentSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/bookings/b1/photo.jpg',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const onChange = vi.fn();

    renderWithIntl(<CustomerPhotoUpload bookingId="b1" value={[]} onChange={onChange} />);

    await user.upload(
      screen.getByLabelText('Fotos (opcional)'),
      makeFile('photo.jpg', 'image/jpeg'),
    );
    await screen.findByText('Enviada');

    await user.click(screen.getByRole('button', { name: 'Remover' }));

    expect(screen.queryByRole('img', { name: 'photo.jpg' })).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it('shows an error status when the PUT upload fails', async () => {
    const user = userEvent.setup();
    vi.mocked(createCustomerAttachmentSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/bookings/b1/photo.jpg',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 500 }));

    renderWithIntl(<CustomerPhotoUpload bookingId="b1" value={[]} onChange={vi.fn()} />);

    await user.upload(
      screen.getByLabelText('Fotos (opcional)'),
      makeFile('photo.jpg', 'image/jpeg'),
    );

    expect(await screen.findByText('Erro ao enviar')).toBeInTheDocument();
  });

  it('shows an error status for unsupported file types without requesting a signed URL', async () => {
    const user = userEvent.setup();
    renderWithIntl(<CustomerPhotoUpload bookingId="b1" value={[]} onChange={vi.fn()} />);

    await user.upload(
      screen.getByLabelText('Fotos (opcional)'),
      makeFile('photo.gif', 'image/gif'),
    );

    expect(await screen.findByText('Erro ao enviar')).toBeInTheDocument();
    expect(createCustomerAttachmentSignedUrl).not.toHaveBeenCalled();
  });
});
