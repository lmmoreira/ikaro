// @vitest-environment jsdom
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteSeoResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { SeoTab } from './SeoTab';

// SeoTab is a fully controlled component — a static onChange mock would never update its
// `value` prop, so typing wouldn't visibly change anything. Mirrors HotsiteEditor's real draft.
function ControlledSeoTab({
  initial,
}: {
  readonly initial: HotsiteSeoResponse;
}): React.JSX.Element {
  const [value, setValue] = useState(initial);
  return <SeoTab value={value} onChange={setValue} />;
}

const SEO: HotsiteSeoResponse = { title: null, description: null, ogImageUrl: '' };

describe('SeoTab', () => {
  it('renders both fields', () => {
    renderWithIntl(<SeoTab value={SEO} onChange={vi.fn()} />);

    expect(screen.getByTestId('hotsite-seo-title')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-seo-description')).toBeInTheDocument();
  });

  it('enforces the title max length', () => {
    renderWithIntl(<SeoTab value={SEO} onChange={vi.fn()} />);

    expect(screen.getByTestId('hotsite-seo-title')).toHaveAttribute('maxLength', '60');
  });

  it('enforces the description max length', () => {
    renderWithIntl(<SeoTab value={SEO} onChange={vi.fn()} />);

    expect(screen.getByTestId('hotsite-seo-description')).toHaveAttribute('maxLength', '158');
  });

  it('updates the title on input', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ControlledSeoTab initial={SEO} />);

    const titleInput = screen.getByTestId('hotsite-seo-title');
    await user.type(titleInput, 'Lavacar Estrela');

    expect(titleInput).toHaveValue('Lavacar Estrela');
  });

  it('updates the description on input', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ControlledSeoTab initial={SEO} />);

    const descriptionInput = screen.getByTestId('hotsite-seo-description');
    await user.type(descriptionInput, 'Agende sua lavagem em segundos.');

    expect(descriptionInput).toHaveValue('Agende sua lavagem em segundos.');
  });

  it('clears the field back to null when emptied', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <SeoTab
        value={{ title: 'Título existente', description: null, ogImageUrl: '' }}
        onChange={onChange}
      />,
    );

    await user.clear(screen.getByTestId('hotsite-seo-title'));

    expect(onChange).toHaveBeenLastCalledWith({ title: null, description: null, ogImageUrl: '' });
  });

  it('renders the OG image upload field', () => {
    renderWithIntl(<SeoTab value={SEO} onChange={vi.fn()} />);

    expect(screen.getByTestId('single-image-upload-input')).toBeInTheDocument();
  });

  it('threads value.ogImageUrl through to the upload field preview', () => {
    // Already-absolute (as a resolved GET response would have it) so resolveHotsiteImageDisplayUrl
    // passes it through unchanged — see LogoUpload.spec.tsx's equivalent test for the same pattern.
    renderWithIntl(
      <SeoTab
        value={{ ...SEO, ogImageUrl: 'https://cdn.example.com/og-image.png' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('single-image-upload-preview')).toHaveAttribute(
      'src',
      'https://cdn.example.com/og-image.png',
    );
  });
});
