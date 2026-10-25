// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPublicEnv, renderWithIntl, stubPublicEnv } from '@/test-utils';
import { ServicePublicPageImages } from './ServicePublicPageImages';

// The real upload field (compress → signed URL → PUT) is covered by its own spec; here it is a
// stand-in that exposes its value, its purpose, whether removal keeps the stored object, and a
// button for each way it can call onChange.
vi.mock('@/features/platform/components/hotsite/SingleImageUploadField', () => ({
  SingleImageUploadField: (props: {
    id: string;
    value: string;
    purpose: string;
    keepStoredOnRemove?: boolean;
    onChange: (path: string) => void;
  }) => (
    <div
      data-testid="upload-field"
      data-field-id={props.id}
      data-value={props.value}
      data-purpose={props.purpose}
      data-keep-stored={String(Boolean(props.keepStoredOnRemove))}
    >
      <button type="button" onClick={() => props.onChange('tmp/t/service-profile/u/new.webp')}>
        upload {props.id}
      </button>
      <button type="button" onClick={() => props.onChange('')}>
        remove {props.id}
      </button>
    </div>
  ),
}));

function renderImages(props: Partial<Parameters<typeof ServicePublicPageImages>[0]> = {}) {
  const onCoverChange = vi.fn();
  const onGalleryChange = vi.fn();
  renderWithIntl(
    <ServicePublicPageImages
      cover=""
      gallery={[]}
      onCoverChange={onCoverChange}
      onGalleryChange={onGalleryChange}
      canUpload
      {...props}
    />,
  );
  return { onCoverChange, onGalleryChange };
}

const IMAGE_HOST = 'https://img.example.test/public-bucket';

describe('ServicePublicPageImages', () => {
  // A deliberately different host: the saved images are rendered as the URLs they arrive as.
  beforeEach(() =>
    stubPublicEnv({ NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL: 'https://wrong-host.invalid' }),
  );
  afterEach(() => clearPublicEnv());

  describe('a manager', () => {
    it('uploads the cover with the service-profile purpose and keeps stored objects on remove', () => {
      renderImages({ cover: 'tenants/t/hotsite/service-profile/u/cover.webp' });

      const cover = screen
        .getAllByTestId('upload-field')
        .find((el) => el.dataset.fieldId === 'service-page-cover');
      expect(cover).toHaveAttribute('data-purpose', 'service-profile');
      expect(cover).toHaveAttribute('data-keep-stored', 'true');
      expect(cover).toHaveAttribute('data-value', 'tenants/t/hotsite/service-profile/u/cover.webp');
    });

    it('reports a cover upload', async () => {
      const user = userEvent.setup();
      const { onCoverChange } = renderImages();

      await user.click(screen.getByRole('button', { name: 'upload service-page-cover' }));

      expect(onCoverChange).toHaveBeenCalledWith('tmp/t/service-profile/u/new.webp');
    });

    it('adds an empty gallery slot with "Adicionar imagem"', async () => {
      const user = userEvent.setup();
      const { onGalleryChange } = renderImages({ gallery: ['a.webp'] });

      await user.click(screen.getByTestId('public-page-gallery-add'));

      expect(onGalleryChange).toHaveBeenCalledWith(['a.webp', '']);
    });

    it('fills a slot on upload and drops the slot on remove', async () => {
      const user = userEvent.setup();
      const { onGalleryChange } = renderImages({ gallery: ['a.webp', 'b.webp', 'c.webp'] });

      await user.click(screen.getByRole('button', { name: 'upload service-page-gallery-1' }));
      expect(onGalleryChange).toHaveBeenLastCalledWith([
        'a.webp',
        'tmp/t/service-profile/u/new.webp',
        'c.webp',
      ]);

      await user.click(screen.getByRole('button', { name: 'remove service-page-gallery-0' }));
      expect(onGalleryChange).toHaveBeenLastCalledWith(['b.webp', 'c.webp']);
    });

    it('counts filled images only and stops adding at the limit of 8', () => {
      renderImages({ gallery: [...Array.from({ length: 7 }, (_, i) => `g${i}.webp`), ''] });

      expect(screen.getByTestId('public-page-gallery-count')).toHaveTextContent('7 de 8');
      expect(screen.getByTestId('public-page-gallery-add')).toBeDisabled();
    });

    it('allows adding while under the limit', () => {
      renderImages({ gallery: ['a.webp'] });

      expect(screen.getByTestId('public-page-gallery-add')).toBeEnabled();
    });
  });

  describe('a STAFF user (canUpload=false)', () => {
    it('sees the stored images with no upload or remove control, and the explanatory note', () => {
      renderImages({
        canUpload: false,
        cover: `${IMAGE_HOST}/tenants/t/hotsite/service-profile/u/cover.webp`,
        gallery: [`${IMAGE_HOST}/tenants/t/hotsite/service-profile/u/g1.webp`, ''],
      });

      expect(screen.getByTestId('public-page-images-locked')).toHaveTextContent(
        'Somente gerentes podem enviar ou trocar as imagens',
      );
      expect(screen.queryByTestId('upload-field')).not.toBeInTheDocument();
      expect(screen.queryByTestId('public-page-gallery-add')).not.toBeInTheDocument();
      const images = screen.getAllByRole('img');
      expect(images.map((img) => img.getAttribute('src'))).toEqual([
        `${IMAGE_HOST}/tenants/t/hotsite/service-profile/u/cover.webp`,
        `${IMAGE_HOST}/tenants/t/hotsite/service-profile/u/g1.webp`,
      ]);
    });
  });
});
