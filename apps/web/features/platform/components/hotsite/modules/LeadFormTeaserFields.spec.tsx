// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { getPillOption, queryPillOption, renderWithIntl } from '@/test-utils';
import { LeadFormTeaserFields } from './LeadFormTeaserFields';

vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageSignedUrl: vi.fn(),
  deleteHotsiteImage: vi.fn(),
}));

describe('LeadFormTeaserFields', () => {
  it('renders the draft values, defaulting variant and bgStyle when unset', () => {
    renderWithIntl(
      <LeadFormTeaserFields
        draft={{ title: 'Fale com a gente', ctaLabel: 'Quero conversar' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Fale com a gente')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Quero conversar')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Centralizado' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Cor de fundo' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('reports each field edit via onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <LeadFormTeaserFields
        draft={{ title: '', ctaLabel: '', variant: 'centered', bgStyle: 'background' }}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText('Título'), 'a');
    expect(onChange).toHaveBeenCalledWith({ title: 'a' });

    await user.type(screen.getByLabelText('Texto de destaque (opcional)'), 'a');
    expect(onChange).toHaveBeenCalledWith({ eyebrow: 'a' });

    await user.click(screen.getByRole('radio', { name: 'Alinhado à esquerda' }));
    expect(onChange).toHaveBeenCalledWith({ variant: 'left-aligned' });

    await user.click(screen.getByRole('radio', { name: 'Cor primária' }));
    expect(onChange).toHaveBeenCalledWith({ bgStyle: 'primary' });
  });

  describe('background image focal point (M18-S04/S05 treatment, applied here in M20-S08)', () => {
    it('does not render the focal-point picker when no background image is set', () => {
      renderWithIntl(
        <LeadFormTeaserFields draft={{ title: '', ctaLabel: '' }} onChange={vi.fn()} />,
      );

      expect(
        queryPillOption('lead-form-teaser-background-image-position', 'center'),
      ).not.toBeInTheDocument();
    });

    it('renders the focal-point picker when a background image is set', () => {
      renderWithIntl(
        <LeadFormTeaserFields
          draft={{
            title: '',
            ctaLabel: '',
            backgroundImageUrl: 'tenants/t/hotsite/lead-form/x/y.webp',
          }}
          onChange={vi.fn()}
        />,
      );

      expect(
        getPillOption('lead-form-teaser-background-image-position', 'center'),
      ).toBeInTheDocument();
    });

    it('changing the focal-point pill calls onChange with only that field updated', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      renderWithIntl(
        <LeadFormTeaserFields
          draft={{
            title: '',
            ctaLabel: '',
            backgroundImageUrl: 'tenants/t/hotsite/lead-form/x/y.webp',
          }}
          onChange={onChange}
        />,
      );

      await user.click(getPillOption('lead-form-teaser-background-image-position', 'right'));

      expect(onChange).toHaveBeenCalledWith({ backgroundImagePosition: 'right' });
    });
  });
});
