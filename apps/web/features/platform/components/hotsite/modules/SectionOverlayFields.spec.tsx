// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteSectionOverlay } from '@ikaro/types';
import { getPillOption, renderWithIntl } from '@/test-utils';
import { SectionOverlayFields } from './SectionOverlayFields';

const SOLID: HotsiteSectionOverlay = { type: 'solid', color: '#000000', opacity: 0.4 };
const GRADIENT: HotsiteSectionOverlay = {
  type: 'linear-gradient',
  direction: 'to-right',
  fromColor: '#111111',
  fromOpacity: 0.1,
  toColor: '#222222',
  toOpacity: 0.9,
};

function renderFields(overlay: HotsiteSectionOverlay | undefined) {
  const onChange = vi.fn();
  renderWithIntl(<SectionOverlayFields overlay={overlay} onChange={onChange} />);
  return onChange;
}

describe('SectionOverlayFields', () => {
  it('starts on Automático and shows no colour fields', () => {
    renderFields(undefined);

    expect(getPillOption('presentation-overlay-type', 'default')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByTestId('presentation-overlay-color')).not.toBeInTheDocument();
  });

  it.each([
    ['none', { type: 'none' }],
    ['solid', SOLID],
    [
      'linear-gradient',
      {
        type: 'linear-gradient',
        direction: 'to-bottom',
        fromColor: '#000000',
        fromOpacity: 0,
        toColor: '#000000',
        toOpacity: 0.6,
      },
    ],
  ])('choosing %s starts from a valid overlay of that kind', async (type, expected) => {
    const user = userEvent.setup();
    const onChange = renderFields(undefined);

    await user.click(getPillOption('presentation-overlay-type', type));

    expect(onChange).toHaveBeenLastCalledWith(expected);
  });

  it('Automático removes the overlay', async () => {
    const user = userEvent.setup();
    const onChange = renderFields(SOLID);

    await user.click(getPillOption('presentation-overlay-type', 'default'));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('a solid overlay edits its colour and an opacity stored as 0–1', () => {
    const onChange = renderFields(SOLID);

    fireEvent.change(screen.getByTestId('presentation-overlay-color'), {
      target: { value: '#112233' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ ...SOLID, color: '#112233' });

    expect(screen.getByTestId('presentation-overlay-opacity')).toHaveValue(40);
    fireEvent.change(screen.getByTestId('presentation-overlay-opacity'), {
      target: { value: '75' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ ...SOLID, opacity: 0.75 });
  });

  it('a gradient shows the direction and both stops, each editable', () => {
    const onChange = renderFields(GRADIENT);

    expect(screen.getByTestId('presentation-overlay-direction')).toBeInTheDocument();
    expect(screen.getByTestId('presentation-overlay-from-opacity')).toHaveValue(10);
    expect(screen.getByTestId('presentation-overlay-to-opacity')).toHaveValue(90);

    fireEvent.change(screen.getByTestId('presentation-overlay-from-color'), {
      target: { value: '#abcdef' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ ...GRADIENT, fromColor: '#abcdef' });
    fireEvent.change(screen.getByTestId('presentation-overlay-to-opacity'), {
      target: { value: '50' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ ...GRADIENT, toOpacity: 0.5 });
  });
});
