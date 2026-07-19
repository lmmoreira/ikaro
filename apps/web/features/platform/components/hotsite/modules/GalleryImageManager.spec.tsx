// @vitest-environment jsdom
import { useState } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GalleryImage, StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import {
  deleteHotsiteImage,
  featureBookingPhoto,
  generateHotsiteImageReadSignedUrl,
  generateHotsiteImageSignedUrl,
} from '@/features/platform/api/tenant-settings';
import { getBooking, listBookings } from '@/features/booking/api/staff';
import { ApiError } from '@/shared/lib/api/errors';
import { compressImage } from '@/shared/utils/compress-image';
import { GalleryImageManager } from './GalleryImageManager';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  generateHotsiteImageReadSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
  featureBookingPhoto: vi.fn(),
}));

vi.mock('@/shared/utils/compress-image', () => ({
  compressImage: vi.fn((file: File) => Promise.resolve(file)),
}));

vi.mock('@/features/booking/api/staff', () => ({
  listBookings: vi.fn(),
  getBooking: vi.fn(),
}));

function makeFile(name: string, type: string): File {
  return new File(['fake-image-content'], name, { type });
}

describe('GalleryImageManager', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    vi.mocked(listBookings).mockResolvedValue({ items: [], total: 0, page: 1, limit: 50 });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.mocked(generateHotsiteImageSignedUrl).mockReset();
    vi.mocked(generateHotsiteImageReadSignedUrl).mockReset();
    vi.mocked(deleteHotsiteImage).mockReset();
    vi.mocked(listBookings).mockReset();
    vi.mocked(compressImage).mockReset();
    vi.mocked(compressImage).mockImplementation((file: File) => Promise.resolve(file));
  });

  it('shows an empty state when there are no images', () => {
    renderWithIntl(<GalleryImageManager images={[]} onChange={vi.fn()} />);

    expect(screen.getByTestId('gallery-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('gallery-grid')).not.toBeInTheDocument();
  });

  it('renders existing images with their (already-resolved) URLs', () => {
    const images: GalleryImage[] = [
      { url: 'https://cdn.example.com/g1.jpg', source: 'upload', caption: 'Foto 1' },
    ];

    renderWithIntl(<GalleryImageManager images={images} onChange={vi.fn()} />);

    expect(
      screen.getAllByTestId('gallery-image').find((el) => el.dataset.index === '0'),
    ).toHaveAttribute('src', 'https://cdn.example.com/g1.jpg');
    expect(screen.getByDisplayValue('Foto 1')).toBeInTheDocument();
  });

  it('resolves a raw storage path (re-opened after a save, no fresh local preview) into a displayable absolute URL', () => {
    process.env.NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL = 'http://localhost:4443/ikaro-local-public';
    const images: GalleryImage[] = [
      { url: 'tenants/tenant-1/hotsite/gallery/g1.jpg', source: 'upload' },
    ];

    renderWithIntl(<GalleryImageManager images={images} onChange={vi.fn()} />);

    expect(screen.getByTestId('gallery-image')).toHaveAttribute(
      'src',
      'http://localhost:4443/ikaro-local-public/tenants/tenant-1/hotsite/gallery/g1.jpg',
    );
  });

  it('resolves a tmp/ (not-yet-promoted) image via a private read-signed-URL instead of the public base URL', async () => {
    vi.mocked(generateHotsiteImageReadSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/signed-read?sig=abc',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    const images: GalleryImage[] = [{ url: 'tmp/tenant-1/gallery/u1/g1.jpg', source: 'upload' }];

    renderWithIntl(<GalleryImageManager images={images} onChange={vi.fn()} />);

    expect(generateHotsiteImageReadSignedUrl).toHaveBeenCalledWith(
      'tmp/tenant-1/gallery/u1/g1.jpg',
    );
    await waitFor(() => {
      expect(screen.getByTestId('gallery-image')).toHaveAttribute(
        'src',
        'https://storage.example.com/signed-read?sig=abc',
      );
    });
  });

  it('uploads a new image with purpose "gallery" and appends it to the list', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/gallery/g2.png',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const onChange = vi.fn();

    renderWithIntl(<GalleryImageManager images={[]} onChange={onChange} />);

    await user.upload(screen.getByTestId('gallery-upload-input'), makeFile('g2.png', 'image/png'));

    expect(generateHotsiteImageSignedUrl).toHaveBeenCalledWith({
      fileName: 'g2.png',
      contentType: 'image/png',
      purpose: 'gallery',
    });
    expect(onChange).toHaveBeenCalledWith([
      { url: 'tenants/tenant-1/hotsite/gallery/g2.png', source: 'upload' },
    ]);
  });

  it('uploads the compressed file returned by compressImage, not the original selection', async () => {
    const user = userEvent.setup();
    const compressedFile = makeFile('g2.webp', 'image/webp');
    vi.mocked(compressImage).mockResolvedValue(compressedFile);
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/gallery/g2.webp',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    renderWithIntl(<GalleryImageManager images={[]} onChange={vi.fn()} />);

    await user.upload(screen.getByTestId('gallery-upload-input'), makeFile('g2.png', 'image/png'));

    await waitFor(() => {
      expect(generateHotsiteImageSignedUrl).toHaveBeenCalledWith({
        fileName: 'g2.webp',
        contentType: 'image/webp',
        purpose: 'gallery',
      });
    });
  });

  it('shows the fallback upload-error label for a failure with no recognizable code', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockRejectedValue(new Error('network error'));

    renderWithIntl(<GalleryImageManager images={[]} onChange={vi.fn()} />);

    await user.upload(screen.getByTestId('gallery-upload-input'), makeFile('g2.png', 'image/png'));

    expect(await screen.findByTestId('gallery-upload-error')).toHaveTextContent(
      'Não foi possível enviar a imagem. Tente novamente.',
    );
  });

  it('shows the specific translated message when the signed-url request fails with a known code', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockRejectedValue(
      new ApiError(422, 'Invalid', { code: 'PLATFORM_HOTSITE_IMAGE_NOT_UPLOADED' }),
    );

    renderWithIntl(<GalleryImageManager images={[]} onChange={vi.fn()} />);

    await user.upload(screen.getByTestId('gallery-upload-input'), makeFile('g2.png', 'image/png'));

    expect(await screen.findByTestId('gallery-upload-error')).toHaveTextContent(
      'A imagem informada não foi encontrada.',
    );
  });

  it('typing a caption right after uploading does not break the image preview', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/gallery/g2.png',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));

    function ControlledWrapper(): React.JSX.Element {
      const [images, setImages] = useState<GalleryImage[]>([]);
      return <GalleryImageManager images={images} onChange={setImages} />;
    }

    renderWithIntl(<ControlledWrapper />);

    await user.upload(screen.getByTestId('gallery-upload-input'), makeFile('g2.png', 'image/png'));
    const preview = await screen.findByTestId('gallery-image');
    const objectUrlBeforeTyping = preview.getAttribute('src');
    expect(objectUrlBeforeTyping).toMatch(/^blob:/);

    await user.type(screen.getByPlaceholderText('Legenda (opcional)'), 'Legenda');

    expect(screen.getByTestId('gallery-image')).toHaveAttribute('src', objectUrlBeforeTyping!);
  });

  it('removing an uploaded image revokes its local blob preview URL', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/hotsite/gallery/g2.png',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy.mockResolvedValue(new Response(null, { status: 200 }));
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    function ControlledWrapper(): React.JSX.Element {
      const [images, setImages] = useState<GalleryImage[]>([]);
      return <GalleryImageManager images={images} onChange={setImages} />;
    }

    renderWithIntl(<ControlledWrapper />);

    await user.upload(screen.getByTestId('gallery-upload-input'), makeFile('g2.png', 'image/png'));
    const preview = await screen.findByTestId('gallery-image');
    const blobUrl = preview.getAttribute('src')!;
    expect(blobUrl).toMatch(/^blob:/);

    await user.click(screen.getByTestId('gallery-remove'));

    expect(revokeSpy).toHaveBeenCalledWith(blobUrl);
    revokeSpy.mockRestore();
  });

  it('editing the caption of an image updates only that image', async () => {
    const user = userEvent.setup();
    const images: GalleryImage[] = [
      { url: 'https://cdn.example.com/g1.jpg', source: 'upload' },
      { url: 'https://cdn.example.com/g2.jpg', source: 'upload' },
    ];
    const onChange = vi.fn();

    renderWithIntl(<GalleryImageManager images={images} onChange={onChange} />);

    const captionInputs = screen.getAllByPlaceholderText('Legenda (opcional)');
    await user.type(captionInputs[1], 'X');

    expect(onChange).toHaveBeenLastCalledWith([images[0], { ...images[1], caption: 'X' }]);
  });

  it('removing a freshly-uploaded (raw path) image calls deleteHotsiteImage and drops it from the list', async () => {
    const user = userEvent.setup();
    vi.mocked(deleteHotsiteImage).mockResolvedValue(undefined);
    const images: GalleryImage[] = [
      { url: 'tenants/tenant-1/hotsite/gallery/g1.jpg', source: 'upload' },
    ];
    const onChange = vi.fn();

    renderWithIntl(<GalleryImageManager images={images} onChange={onChange} />);

    await user.click(
      screen.getAllByTestId('gallery-remove').find((el) => el.dataset.index === '0')!,
    );

    expect(deleteHotsiteImage).toHaveBeenCalledWith('tenants/tenant-1/hotsite/gallery/g1.jpg');
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('removing a not-yet-promoted tmp/ image calls deleteHotsiteImage and drops it from the list', async () => {
    const user = userEvent.setup();
    vi.mocked(generateHotsiteImageReadSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/signed-read?sig=abc',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    vi.mocked(deleteHotsiteImage).mockResolvedValue(undefined);
    const images: GalleryImage[] = [{ url: 'tmp/tenant-1/gallery/u1/g1.jpg', source: 'upload' }];
    const onChange = vi.fn();

    renderWithIntl(<GalleryImageManager images={images} onChange={onChange} />);

    await user.click(
      screen.getAllByTestId('gallery-remove').find((el) => el.dataset.index === '0')!,
    );

    expect(deleteHotsiteImage).toHaveBeenCalledWith('tmp/tenant-1/gallery/u1/g1.jpg');
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('removing an already-resolved public URL image drops it from the list without calling deleteHotsiteImage', async () => {
    const user = userEvent.setup();
    const images: GalleryImage[] = [{ url: 'https://cdn.example.com/g1.jpg', source: 'upload' }];
    const onChange = vi.fn();

    renderWithIntl(<GalleryImageManager images={images} onChange={onChange} />);

    await user.click(
      screen.getAllByTestId('gallery-remove').find((el) => el.dataset.index === '0')!,
    );

    expect(deleteHotsiteImage).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('opens the booking photo picker when "use a photo from a booking" is clicked', async () => {
    const user = userEvent.setup();

    renderWithIntl(<GalleryImageManager images={[]} onChange={vi.fn()} />);

    expect(screen.queryByTestId('booking-photo-picker-close')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('gallery-open-picker'));

    expect(await screen.findByTestId('booking-photo-picker-close')).toBeInTheDocument();
  });

  it('closing the booking photo picker hides it again', async () => {
    const user = userEvent.setup();

    renderWithIntl(<GalleryImageManager images={[]} onChange={vi.fn()} />);

    await user.click(screen.getByTestId('gallery-open-picker'));
    await user.click(await screen.findByTestId('booking-photo-picker-close'));

    expect(screen.queryByTestId('booking-photo-picker-close')).not.toBeInTheDocument();
  });

  it('picking a photo from the booking picker appends it and closes the picker', async () => {
    const user = userEvent.setup();
    vi.mocked(listBookings).mockResolvedValue({
      items: [
        {
          bookingId: 'b-1',
          status: 'COMPLETED',
          scheduledAt: '2026-06-01T10:00:00.000Z',
          contactName: 'João Silva',
          serviceNames: ['Lavagem'],
          totalPrice: { amount: 50, currency: 'BRL' },
          totalDurationMins: 30,
          isCustomer: true,
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    const detailResponse: Partial<StaffBookingDetailResponse> = {
      beforeServicePhotoUrls: ['https://cdn.example.com/before-1.jpg'],
      afterServicePhotoUrls: [],
      beforeServicePhotoPaths: ['tenants/tenant-1/bookings/b-1/before-1.jpg'],
      afterServicePhotoPaths: [],
    };
    vi.mocked(getBooking).mockResolvedValue(detailResponse as StaffBookingDetailResponse);
    vi.mocked(featureBookingPhoto).mockResolvedValue({
      filePath: 'tenants/tenant-1/hotsite/gallery/g1/before-1.jpg',
      url: 'https://public.storage.example.com/tenants/tenant-1/hotsite/gallery/g1/before-1.jpg',
      photoType: 'before',
    });
    const onChange = vi.fn();

    renderWithIntl(<GalleryImageManager images={[]} onChange={onChange} />);

    await user.click(screen.getByTestId('gallery-open-picker'));
    await user.selectOptions(await screen.findByTestId('booking-photo-picker-select'), 'b-1');
    const grid = await screen.findByTestId('booking-photo-picker-grid');
    const beforeThumb = grid.querySelector('img[src="https://cdn.example.com/before-1.jpg"]');
    await user.click(beforeThumb!.closest('button')!);

    expect(onChange).toHaveBeenCalledWith([
      {
        url: 'tenants/tenant-1/hotsite/gallery/g1/before-1.jpg',
        source: 'booking',
        bookingId: 'b-1',
        photoType: 'before',
      },
    ]);
    expect(screen.queryByTestId('booking-photo-picker-close')).not.toBeInTheDocument();
  });
});
