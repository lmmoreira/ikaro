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

const SEO: HotsiteSeoResponse = { title: null, description: null };

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
      <SeoTab value={{ title: 'Título existente', description: null }} onChange={onChange} />,
    );

    await user.clear(screen.getByTestId('hotsite-seo-title'));

    expect(onChange).toHaveBeenLastCalledWith({ title: null, description: null });
  });
});
