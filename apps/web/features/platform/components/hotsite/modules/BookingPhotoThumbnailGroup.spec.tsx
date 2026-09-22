// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BookingPhotoThumbnailGroup } from './BookingPhotoThumbnailGroup';

describe('BookingPhotoThumbnailGroup', () => {
  it('renders one thumbnail button per url with the given label', () => {
    const { container } = render(
      <BookingPhotoThumbnailGroup
        urls={['https://cdn.example.com/a.jpg', 'https://cdn.example.com/b.jpg']}
        label="Antes"
        picking={false}
        photoDimensions={new Map()}
        onPick={vi.fn()}
        onThumbnailLoad={vi.fn()}
      />,
    );

    expect(screen.getAllByText('Antes')).toHaveLength(2);
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('disables a button until its url has a captured dimension', () => {
    const url = 'https://cdn.example.com/a.jpg';
    const { rerender } = render(
      <BookingPhotoThumbnailGroup
        urls={[url]}
        label="Antes"
        picking={false}
        photoDimensions={new Map()}
        onPick={vi.fn()}
        onThumbnailLoad={vi.fn()}
      />,
    );

    expect(screen.getByRole('button')).toBeDisabled();

    rerender(
      <BookingPhotoThumbnailGroup
        urls={[url]}
        label="Antes"
        picking={false}
        photoDimensions={new Map([[url, { width: 100, height: 100 }]])}
        onPick={vi.fn()}
        onThumbnailLoad={vi.fn()}
      />,
    );

    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('disables every button while picking, even for a url with a captured dimension', () => {
    const url = 'https://cdn.example.com/a.jpg';
    render(
      <BookingPhotoThumbnailGroup
        urls={[url]}
        label="Antes"
        picking
        photoDimensions={new Map([[url, { width: 100, height: 100 }]])}
        onPick={vi.fn()}
        onThumbnailLoad={vi.fn()}
      />,
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls onPick with the clicked url index', async () => {
    const user = userEvent.setup();
    const url = 'https://cdn.example.com/a.jpg';
    const onPick = vi.fn();
    render(
      <BookingPhotoThumbnailGroup
        urls={[url]}
        label="Antes"
        picking={false}
        photoDimensions={new Map([[url, { width: 100, height: 100 }]])}
        onPick={onPick}
        onThumbnailLoad={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button'));

    expect(onPick).toHaveBeenCalledWith(0);
  });

  it('calls onThumbnailLoad with the url when its thumbnail image loads', () => {
    const url = 'https://cdn.example.com/a.jpg';
    const onThumbnailLoad = vi.fn();
    const { container } = render(
      <BookingPhotoThumbnailGroup
        urls={[url]}
        label="Antes"
        picking={false}
        photoDimensions={new Map()}
        onPick={vi.fn()}
        onThumbnailLoad={onThumbnailLoad}
      />,
    );

    fireEvent.load(container.querySelector('img')!);

    expect(onThumbnailLoad).toHaveBeenCalledWith(url, expect.anything());
  });
});
