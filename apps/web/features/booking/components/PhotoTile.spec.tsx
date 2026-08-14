// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PhotoTile } from './PhotoTile';

describe('PhotoTile', () => {
  it('renders the image when it loads successfully', () => {
    render(
      <PhotoTile
        url="https://storage.googleapis.com/ikaro-uploads-staging/tenants/t-1/booking/before.jpg"
        alt="Foto antes do serviço 1"
        unavailableLabel="Foto expirada"
        unavailableAlt="Foto indisponível"
        className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
      />,
    );

    const img = screen.getByRole('img', { name: 'Foto antes do serviço 1' });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute(
      'src',
      'https://storage.googleapis.com/ikaro-uploads-staging/tenants/t-1/booking/before.jpg',
    );
  });

  it('swaps to the localized placeholder when the image fails to load', () => {
    render(
      <PhotoTile
        url="https://storage.googleapis.com/ikaro-uploads-staging/tenants/t-1/booking/expired.jpg"
        alt="Foto antes do serviço 1"
        unavailableLabel="Foto expirada"
        unavailableAlt="Foto indisponível"
        className="aspect-square w-full rounded-lg border border-gray-200 object-cover"
      />,
    );

    const img = screen.getByRole('img', { name: 'Foto antes do serviço 1' });
    fireEvent.error(img);

    expect(screen.queryByRole('img', { name: 'Foto antes do serviço 1' })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto indisponível' })).toBeInTheDocument();
    expect(screen.getByText('Foto expirada')).toBeInTheDocument();
  });
});
