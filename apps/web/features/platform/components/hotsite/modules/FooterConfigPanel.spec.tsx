// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FooterModuleData } from '@ikaro/types';
import { getPillOption, queryPillOption, renderWithIntl } from '@/test-utils';
import { FooterConfigPanel } from './FooterConfigPanel';
import { writeModuleData } from './module-config-panel.types';

const FOOTER: FooterModuleData = {};

describe('FooterConfigPanel', () => {
  describe('section appearance (Story 6: the footer surface)', () => {
    it('picks a surface and carries it next to the footer data', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithIntl(<FooterConfigPanel data={writeModuleData(FOOTER)} onChange={onChange} />);

      await user.click(getPillOption('presentation-surface', 'primary'));

      expect(onChange).toHaveBeenLastCalledWith({ presentation: { surface: 'primary' } });
    });

    it('seeds a colour for the custom surface', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithIntl(<FooterConfigPanel data={writeModuleData(FOOTER)} onChange={onChange} />);

      await user.click(getPillOption('presentation-surface', 'custom'));

      expect(onChange).toHaveBeenLastCalledWith({
        presentation: { surface: 'custom', customColor: '#FFFFFF' },
      });
    });

    // Negative guarantee: the backend refuses any other presentation key on a footer.
    it('offers nothing but the surface', () => {
      renderWithIntl(<FooterConfigPanel data={writeModuleData(FOOTER)} onChange={vi.fn()} />);

      expect(queryPillOption('presentation-content-width', 'narrow')).toBeNull();
      expect(queryPillOption('presentation-min-height', 'sm')).toBeNull();
      expect(queryPillOption('presentation-padding', 'none')).toBeNull();
      expect(queryPillOption('presentation-overlay-type', 'solid')).toBeNull();
      expect(screen.queryByTestId('single-image-upload-input')).not.toBeInTheDocument();
    });

    it('keeps the presentation when the tagline changes', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithIntl(
        <FooterConfigPanel
          data={writeModuleData({ ...FOOTER, presentation: { surface: 'secondary' } })}
          onChange={onChange}
        />,
      );

      await user.type(screen.getByLabelText('Slogan (opcional)'), 'x');

      expect(onChange).toHaveBeenLastCalledWith({
        tagline: 'x',
        presentation: { surface: 'secondary' },
      });
    });
  });

  it('renders with all fields empty/defaulted when data is {}', () => {
    renderWithIntl(<FooterConfigPanel data={writeModuleData(FOOTER)} onChange={vi.fn()} />);

    expect(screen.getByTestId('footer-show-whatsapp')).toHaveAttribute('aria-checked', 'true');
  });

  it('editing the tagline calls onChange with only that field updated', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<FooterConfigPanel data={writeModuleData(FOOTER)} onChange={onChange} />);

    await user.type(screen.getByLabelText('Slogan (opcional)'), 'X');

    expect(onChange).toHaveBeenLastCalledWith(writeModuleData({ ...FOOTER, tagline: 'X' }));
  });

  it('toggling showWhatsapp calls onChange with the flipped value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<FooterConfigPanel data={writeModuleData(FOOTER)} onChange={onChange} />);

    await user.click(screen.getByTestId('footer-show-whatsapp'));

    expect(onChange).toHaveBeenCalledWith(writeModuleData({ ...FOOTER, showWhatsapp: false }));
  });
});
