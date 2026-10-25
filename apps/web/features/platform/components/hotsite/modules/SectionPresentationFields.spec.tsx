// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteModulePresentation, HotsiteModuleType } from '@ikaro/types';
import { getPillOption, queryPillOption, renderWithIntl } from '@/test-utils';
import { SectionPresentationFields } from './SectionPresentationFields';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  generateHotsiteImageReadSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

function renderFields(
  moduleType: HotsiteModuleType,
  value?: HotsiteModulePresentation,
): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  renderWithIntl(
    <SectionPresentationFields moduleType={moduleType} value={value} onChange={onChange} />,
  );
  return onChange;
}

describe('SectionPresentationFields', () => {
  // Negative guarantee: page chrome and the floating widget have no section to style.
  it.each(['NAVIGATION', 'CHATBOT'] as const)('renders nothing for %s', (type) => {
    renderFields(type);

    expect(screen.queryByTestId('section-presentation')).not.toBeInTheDocument();
  });

  it('starts every field on Automatic and reports no presentation until one is changed', () => {
    const onChange = renderFields('ABOUT');

    expect(getPillOption('presentation-surface', 'default')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('picks a surface, width, height and spacing, each as its own field', async () => {
    const user = userEvent.setup();
    const onChange = renderFields('ABOUT');

    await user.click(getPillOption('presentation-surface', 'primary'));
    expect(onChange).toHaveBeenLastCalledWith({ surface: 'primary' });

    await user.click(getPillOption('presentation-content-width', 'narrow'));
    expect(onChange).toHaveBeenLastCalledWith({ contentWidth: 'narrow' });

    await user.click(getPillOption('presentation-min-height', 'viewport'));
    expect(onChange).toHaveBeenLastCalledWith({ minHeight: 'viewport' });

    await user.click(getPillOption('presentation-padding', 'spacious'));
    expect(onChange).toHaveBeenLastCalledWith({ padding: 'spacious' });
  });

  it('keeps the other fields when one changes', async () => {
    const user = userEvent.setup();
    const onChange = renderFields('ABOUT', { surface: 'primary' });

    await user.click(getPillOption('presentation-padding', 'compact'));

    expect(onChange).toHaveBeenLastCalledWith({ surface: 'primary', padding: 'compact' });
  });

  it('returns undefined when the last field goes back to Automatic', async () => {
    const user = userEvent.setup();
    const onChange = renderFields('ABOUT', { surface: 'primary' });

    await user.click(getPillOption('presentation-surface', 'default'));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  describe('custom surface', () => {
    it('seeds a colour when Custom is chosen, because the schema requires one', async () => {
      const user = userEvent.setup();
      const onChange = renderFields('ABOUT');

      await user.click(getPillOption('presentation-surface', 'custom'));

      expect(onChange).toHaveBeenLastCalledWith({ surface: 'custom', customColor: '#FFFFFF' });
    });

    it('edits the colour', () => {
      const onChange = renderFields('ABOUT', { surface: 'custom', customColor: '#112233' });

      fireEvent.change(screen.getByTestId('presentation-custom-color'), {
        target: { value: '#445566' },
      });

      expect(onChange).toHaveBeenLastCalledWith({ surface: 'custom', customColor: '#445566' });
    });

    // Negative guarantee: customColor is rejected for every other surface.
    it('drops the colour when another surface replaces Custom', async () => {
      const user = userEvent.setup();
      const onChange = renderFields('ABOUT', { surface: 'custom', customColor: '#112233' });

      await user.click(getPillOption('presentation-surface', 'secondary'));

      expect(onChange).toHaveBeenLastCalledWith({ surface: 'secondary' });
    });

    it('flags a malformed colour only once the field is left', async () => {
      const user = userEvent.setup();
      renderFields('ABOUT', { surface: 'custom', customColor: '#12' });

      expect(screen.queryByTestId('presentation-custom-color-error')).not.toBeInTheDocument();
      await user.click(screen.getByTestId('presentation-custom-color'));
      await user.tab();

      expect(screen.getByTestId('presentation-custom-color-error')).toBeInTheDocument();
    });
  });

  describe('which controls each module gets', () => {
    // Negative guarantee: a footer picks a surface and nothing else.
    it('FOOTER: surface only', () => {
      renderFields('FOOTER');

      expect(getPillOption('presentation-surface', 'primary')).toBeInTheDocument();
      expect(queryPillOption('presentation-content-width', 'narrow')).toBeNull();
      expect(queryPillOption('presentation-overlay-type', 'solid')).toBeNull();
      expect(screen.queryByTestId('single-image-upload-input')).not.toBeInTheDocument();
    });

    // Negative guarantee: these keep their own background image, so they take no second one.
    it.each(['HERO', 'BOOKING_CTA', 'LEAD_FORM'] as const)(
      '%s: layout and overlay, no background image',
      (type) => {
        renderFields(type);

        expect(getPillOption('presentation-content-width', 'wide')).toBeInTheDocument();
        expect(getPillOption('presentation-overlay-type', 'solid')).toBeInTheDocument();
        expect(screen.queryByTestId('single-image-upload-input')).not.toBeInTheDocument();
      },
    );

    it.each([
      'SERVICE_LIST',
      'GALLERY',
      'TESTIMONIALS',
      'ABOUT',
      'CONTACT',
      'CONTENT_BLOCK',
    ] as const)('%s: also a background image', (type) => {
      renderFields(type);

      expect(screen.getByTestId('single-image-upload-input')).toBeInTheDocument();
    });
  });

  describe('background image', () => {
    it('shows the focus choice once an image is set, and keeps the image when it changes', async () => {
      const user = userEvent.setup();
      const onChange = renderFields('ABOUT', {
        background: { imageUrl: 'tenants/t/hotsite/section-background/a.png' },
      });

      await user.click(getPillOption('presentation-background-position', 'left'));

      expect(onChange).toHaveBeenLastCalledWith({
        background: { imageUrl: 'tenants/t/hotsite/section-background/a.png', position: 'left' },
      });
    });

    it('has no focus choice without an image', () => {
      renderFields('ABOUT');

      expect(queryPillOption('presentation-background-position', 'left')).toBeNull();
    });
  });

  describe('overlay', () => {
    it('Solid starts at a sensible colour and opacity', async () => {
      const user = userEvent.setup();
      const onChange = renderFields('HERO');

      await user.click(getPillOption('presentation-overlay-type', 'solid'));

      expect(onChange).toHaveBeenLastCalledWith({
        overlay: { type: 'solid', color: '#000000', opacity: 0.4 },
      });
    });

    it('edits the opacity as a percentage and stores 0–1', () => {
      const onChange = renderFields('HERO', {
        overlay: { type: 'solid', color: '#000000', opacity: 0.4 },
      });

      expect(screen.getByTestId('presentation-overlay-opacity')).toHaveValue(40);
      fireEvent.change(screen.getByTestId('presentation-overlay-opacity'), {
        target: { value: '65' },
      });

      expect(onChange).toHaveBeenLastCalledWith({
        overlay: { type: 'solid', color: '#000000', opacity: 0.65 },
      });
    });

    // Negative guarantee: the schema rejects an opacity outside 0–1.
    it('clamps an out-of-range opacity into 0–1', () => {
      const onChange = renderFields('HERO', {
        overlay: { type: 'solid', color: '#000000', opacity: 0.4 },
      });

      fireEvent.change(screen.getByTestId('presentation-overlay-opacity'), {
        target: { value: '250' },
      });

      expect(onChange).toHaveBeenLastCalledWith({
        overlay: { type: 'solid', color: '#000000', opacity: 1 },
      });
    });

    it('Gradient shows direction, both colours and both opacities', async () => {
      const user = userEvent.setup();
      const onChange = renderFields('HERO');

      await user.click(getPillOption('presentation-overlay-type', 'linear-gradient'));

      expect(onChange).toHaveBeenLastCalledWith({
        overlay: {
          type: 'linear-gradient',
          direction: 'to-bottom',
          fromColor: '#000000',
          fromOpacity: 0,
          toColor: '#000000',
          toOpacity: 0.6,
        },
      });
    });

    it('renders every gradient input for an existing gradient', () => {
      renderFields('HERO', {
        overlay: {
          type: 'linear-gradient',
          direction: 'to-right',
          fromColor: '#111111',
          fromOpacity: 0.1,
          toColor: '#222222',
          toOpacity: 0.9,
        },
      });

      expect(screen.getByTestId('presentation-overlay-from-color')).toHaveValue('#111111');
      expect(screen.getByTestId('presentation-overlay-from-opacity')).toHaveValue(10);
      expect(screen.getByTestId('presentation-overlay-to-color')).toHaveValue('#222222');
      expect(screen.getByTestId('presentation-overlay-to-opacity')).toHaveValue(90);
      expect(screen.getByTestId('presentation-overlay-direction')).toBeInTheDocument();
    });

    it('Automatic removes the overlay', async () => {
      const user = userEvent.setup();
      const onChange = renderFields('HERO', {
        overlay: { type: 'solid', color: '#000000', opacity: 0.4 },
      });

      await user.click(getPillOption('presentation-overlay-type', 'default'));

      expect(onChange).toHaveBeenLastCalledWith(undefined);
    });
  });
});
