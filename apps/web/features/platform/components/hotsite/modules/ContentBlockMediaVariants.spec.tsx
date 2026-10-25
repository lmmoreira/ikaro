// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  ContentBlockCollageCalloutData,
  ContentBlockTechnicalCalloutData,
} from '@ikaro/types';
import { getPillOption, renderWithIntl } from '@/test-utils';
import { CollageFields, TechnicalCalloutFields } from './ContentBlockMediaVariants';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  generateHotsiteImageReadSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

const COLLAGE: ContentBlockCollageCalloutData = {
  variant: 'collage-callout',
  title: 'T',
  images: [{ url: 'tenants/t/a.png' }, { url: 'tenants/t/b.png', alt: 'segunda' }],
};
const TECHNICAL: ContentBlockTechnicalCalloutData = {
  variant: 'technical-callout',
  title: 'T',
  facts: [{ value: '10 anos', label: 'Garantia' }],
};

describe('CollageFields', () => {
  it('shows an upload slot and a description field per photo', () => {
    renderWithIntl(<CollageFields data={COLLAGE} onChange={vi.fn()} />);

    expect(screen.getAllByTestId('single-image-upload-input')).toHaveLength(2);
    expect(screen.getByLabelText(/Descrição da foto 2/)).toHaveValue('segunda');
    expect(screen.getByLabelText(/Descrição da foto 1/)).toHaveAttribute('maxlength', '120');
  });

  it('adds an empty slot', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<CollageFields data={COLLAGE} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Adicionar foto' }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...COLLAGE,
      images: [...COLLAGE.images, { url: '' }],
    });
  });

  // Negative guarantee: a collage needs two photos at least and four at most.
  it('keeps two photos at least and four at most', () => {
    const { unmount } = renderWithIntl(<CollageFields data={COLLAGE} onChange={vi.fn()} />);
    for (const remove of screen.getAllByTestId('content-block-item-remove')) {
      expect(remove).toBeDisabled();
    }
    unmount();

    const four = Array.from({ length: 4 }, (_, i) => ({ url: `tenants/t/${i}.png` }));
    renderWithIntl(<CollageFields data={{ ...COLLAGE, images: four }} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Adicionar foto' })).toBeDisabled();
  });

  it('removes the alt key when its text is cleared', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<CollageFields data={COLLAGE} onChange={onChange} />);

    await user.clear(screen.getByLabelText(/Descrição da foto 2/));

    expect(onChange).toHaveBeenLastCalledWith({
      ...COLLAGE,
      images: [COLLAGE.images[0], { url: 'tenants/t/b.png' }],
    });
  });
});

describe('TechnicalCalloutFields', () => {
  it('picks where the highlights go', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<TechnicalCalloutFields data={TECHNICAL} onChange={onChange} />);

    await user.click(getPillOption('content-block-facts-placement', 'kicker'));

    expect(onChange).toHaveBeenLastCalledWith({ ...TECHNICAL, factsPlacement: 'kicker' });
  });

  it('adds up to four highlights and removes down to none', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<TechnicalCalloutFields data={TECHNICAL} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Adicionar destaque' }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...TECHNICAL,
      facts: [...(TECHNICAL.facts ?? []), { value: '', label: '' }],
    });

    await user.click(screen.getByTestId('content-block-item-remove'));
    expect(onChange).toHaveBeenLastCalledWith({ ...TECHNICAL, facts: [] });
  });

  it('works with no highlights at all and bounds a highlight’s fields', () => {
    renderWithIntl(
      <TechnicalCalloutFields
        data={{ variant: 'technical-callout', title: 'T' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('content-block-item-remove')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar destaque' })).toBeEnabled();
  });

  it('bounds a highlight’s value and label', () => {
    renderWithIntl(<TechnicalCalloutFields data={TECHNICAL} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Valor do destaque 1')).toHaveAttribute('maxlength', '20');
    expect(screen.getByLabelText('Rótulo do destaque 1')).toHaveAttribute('maxlength', '40');
  });
});
