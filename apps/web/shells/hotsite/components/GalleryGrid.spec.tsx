// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { GalleryGrid } from './GalleryGrid';

function makeLink(url: string, caption = ''): React.ReactElement {
  return (
    <a key={url} href={url} data-gallery-url={url} data-gallery-caption={caption}>
      <img src={url} alt={caption || 'photo'} />
    </a>
  );
}

describe('GalleryGrid', () => {
  it('renders its children', () => {
    const { container } = renderWithIntl(
      <GalleryGrid maxVisible={6} totalImages={1}>
        {makeLink('https://storage.example.com/photo.jpg')}
      </GalleryGrid>,
    );

    expect(container.querySelector('img')).toBeInTheDocument();
  });

  it('shows "Ver mais" button when totalImages > maxVisible', () => {
    renderWithIntl(
      <GalleryGrid maxVisible={2} totalImages={5}>
        {makeLink('https://storage.example.com/photo.jpg')}
      </GalleryGrid>,
    );

    expect(screen.getByRole('button', { name: 'Ver mais' })).toBeInTheDocument();
  });

  it('does not show "Ver mais" when totalImages <= maxVisible', () => {
    renderWithIntl(
      <GalleryGrid maxVisible={6} totalImages={3}>
        {makeLink('https://storage.example.com/photo.jpg')}
      </GalleryGrid>,
    );

    expect(screen.queryByRole('button', { name: 'Ver mais' })).not.toBeInTheDocument();
  });

  it('sets data-gallery-expanded to true and hides the button after clicking "Ver mais"', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <GalleryGrid maxVisible={2} totalImages={5}>
        {makeLink('https://storage.example.com/photo.jpg')}
      </GalleryGrid>,
    );

    await user.click(screen.getByRole('button', { name: 'Ver mais' }));

    expect(container.querySelector('[data-gallery-expanded]')).toHaveAttribute(
      'data-gallery-expanded',
      'true',
    );
    expect(screen.queryByRole('button', { name: 'Ver mais' })).not.toBeInTheDocument();
  });

  it('opens the lightbox when a [data-gallery-url] child link is clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <GalleryGrid maxVisible={6} totalImages={1}>
        {makeLink('https://storage.example.com/full.jpg', 'Antes')}
      </GalleryGrid>,
    );

    await user.click(screen.getByRole('link'));

    const dialog = container.querySelector('dialog');
    expect(dialog?.querySelector('img')).toHaveAttribute(
      'src',
      'https://storage.example.com/full.jpg',
    );
  });

  it('shows the caption inside the lightbox when the image has one', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <GalleryGrid maxVisible={6} totalImages={1}>
        {makeLink('https://storage.example.com/photo.jpg', 'Lavagem completa')}
      </GalleryGrid>,
    );

    await user.click(screen.getByRole('link'));

    expect(container.querySelector('dialog p')?.textContent).toBe('Lavagem completa');
  });

  it('closes the lightbox when the close button is clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <GalleryGrid maxVisible={6} totalImages={1}>
        {makeLink('https://storage.example.com/photo.jpg')}
      </GalleryGrid>,
    );

    await user.click(screen.getByRole('link'));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    const dialog = container.querySelector('dialog');
    expect(dialog?.querySelector('img')).not.toBeInTheDocument();
  });

  it('closes the lightbox when the backdrop button is clicked', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <GalleryGrid maxVisible={6} totalImages={1}>
        {makeLink('https://storage.example.com/photo.jpg')}
      </GalleryGrid>,
    );

    await user.click(screen.getByRole('link'));
    await user.click(screen.getByRole('button', { name: 'Fechar lightbox' }));

    const dialog = container.querySelector('dialog');
    expect(dialog?.querySelector('img')).not.toBeInTheDocument();
  });
});
