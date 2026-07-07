// @vitest-environment jsdom
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteBrandingResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BrandingTab } from './BrandingTab';

// BrandingTab is a fully controlled component — a static onChange mock would never update its
// `value` prop, so typing into a color field wouldn't visibly change anything. This wrapper
// mirrors how HotsiteEditor actually owns the draft state.
function ControlledBrandingTab({
  initial,
}: {
  readonly initial: HotsiteBrandingResponse;
}): React.JSX.Element {
  const [value, setValue] = useState(initial);
  return <BrandingTab value={value} onChange={setValue} />;
}

const BRANDING: HotsiteBrandingResponse = {
  primaryColor: '#2563eb',
  secondaryColor: '#eff6ff',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  headingFontFamily: 'Inter',
  bodyFontFamily: 'Inter',
  logoUrl: '',
  borderRadius: 'rounded',
  buttonStyle: 'filled',
  spacing: 'comfortable',
  shadowStyle: 'subtle',
  buttonBackgroundColor: undefined,
  buttonTextColor: undefined,
  heroBgStyle: 'primary',
  alternateSectionBg: false,
  dividerStyle: 'none',
  brandName: undefined,
  brandTagline: undefined,
};

describe('BrandingTab', () => {
  it('renders all 5 sub-sections', () => {
    renderWithIntl(<BrandingTab value={BRANDING} onChange={vi.fn()} />);

    expect(screen.getByText('Cores')).toBeInTheDocument();
    expect(screen.getByText('Logo e identidade')).toBeInTheDocument();
    expect(screen.getByText('Tipografia')).toBeInTheDocument();
    expect(screen.getByText('Forma e estilo')).toBeInTheDocument();
    expect(screen.getByText('Ritmo visual')).toBeInTheDocument();
  });

  it('renders all 18 branding fields', () => {
    renderWithIntl(<BrandingTab value={BRANDING} onChange={vi.fn()} />);

    // Cores (6)
    expect(screen.getByTestId('hotsite-primary-color')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-secondary-color')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-background-color')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-text-color')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-button-background-color')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-button-text-color')).toBeInTheDocument();
    // Logo e identidade (3)
    expect(screen.getByTestId('single-image-upload-input')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-brand-name')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-brand-tagline')).toBeInTheDocument();
    // Tipografia (2)
    expect(screen.getByTestId('hotsite-heading-font')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-body-font')).toBeInTheDocument();
    // Forma e estilo (4)
    expect(screen.getByRole('radiogroup', { name: 'Cantos' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Estilo de botão' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Espaçamento' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Sombra' })).toBeInTheDocument();
    // Ritmo visual (3)
    expect(screen.getByRole('radiogroup', { name: 'Fundo do Hero' })).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-alternate-section-bg')).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Divisor entre seções' })).toBeInTheDocument();
  });

  it('shows the inline hex error only after the field is blurred, and blocks via the error message', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ControlledBrandingTab initial={BRANDING} />);

    const primaryColorInput = screen.getByTestId('hotsite-primary-color');
    await user.clear(primaryColorInput);
    await user.type(primaryColorInput, 'azul claro');
    expect(
      screen.queryByText('Cor inválida. Use o formato hexadecimal, ex: #2563eb.'),
    ).not.toBeInTheDocument();

    await user.tab();

    expect(
      screen.getByText('Cor inválida. Use o formato hexadecimal, ex: #2563eb.'),
    ).toBeInTheDocument();
  });

  it('does not show an error for an empty optional color field on blur', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ControlledBrandingTab initial={BRANDING} />);

    await user.click(screen.getByTestId('hotsite-button-background-color'));
    await user.tab();

    expect(
      screen.queryByText('Cor inválida. Use o formato hexadecimal, ex: #2563eb.'),
    ).not.toBeInTheDocument();
  });

  it('calls onChange with the updated field when a pill option is selected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<BrandingTab value={BRANDING} onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: 'Retos' }));

    expect(onChange).toHaveBeenCalledWith({ ...BRANDING, borderRadius: 'sharp' });
  });

  it('calls onChange when the alternate-section-background switch is toggled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<BrandingTab value={BRANDING} onChange={onChange} />);

    await user.click(screen.getByTestId('hotsite-alternate-section-bg'));

    expect(onChange).toHaveBeenCalledWith({ ...BRANDING, alternateSectionBg: true });
  });
});
