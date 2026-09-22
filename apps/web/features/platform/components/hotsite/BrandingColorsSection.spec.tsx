// @vitest-environment jsdom
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteBrandingResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BrandingColorsSection } from './BrandingColorsSection';

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

// BrandingColorsSection is a fully controlled component (mirrors BrandingTab.spec.tsx's own
// wrapper) — a static vi.fn() handler never updates `value`, so a blur- or typing-driven
// re-render would reset the input back to its original prop value. This wrapper owns the draft
// branding state the way BrandingTab actually does.
function ControlledColorsSection({
  initial,
}: {
  readonly initial: HotsiteBrandingResponse;
}): React.JSX.Element {
  const [value, setValue] = useState(initial);
  return (
    <BrandingColorsSection
      value={value}
      onPrimaryColorChange={(v) => setValue((current) => ({ ...current, primaryColor: v }))}
      onSecondaryColorChange={(v) => setValue((current) => ({ ...current, secondaryColor: v }))}
      onBackgroundColorChange={(v) => setValue((current) => ({ ...current, backgroundColor: v }))}
      onTextColorChange={(v) => setValue((current) => ({ ...current, textColor: v }))}
      onButtonBackgroundColorChange={(v) =>
        setValue((current) => ({ ...current, buttonBackgroundColor: v }))
      }
      onButtonTextColorChange={(v) => setValue((current) => ({ ...current, buttonTextColor: v }))}
    />
  );
}

describe('BrandingColorsSection', () => {
  it('renders all 6 color fields', () => {
    renderWithIntl(
      <BrandingColorsSection
        value={BRANDING}
        onPrimaryColorChange={vi.fn()}
        onSecondaryColorChange={vi.fn()}
        onBackgroundColorChange={vi.fn()}
        onTextColorChange={vi.fn()}
        onButtonBackgroundColorChange={vi.fn()}
        onButtonTextColorChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('hotsite-primary-color')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-secondary-color')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-background-color')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-text-color')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-button-background-color')).toBeInTheDocument();
    expect(screen.getByTestId('hotsite-button-text-color')).toBeInTheDocument();
  });

  it('shows the inline hex error only after the field is blurred with an invalid value', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ControlledColorsSection initial={BRANDING} />);

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
    renderWithIntl(<ControlledColorsSection initial={BRANDING} />);

    await user.click(screen.getByTestId('hotsite-button-background-color'));
    await user.tab();

    expect(
      screen.queryByText('Cor inválida. Use o formato hexadecimal, ex: #2563eb.'),
    ).not.toBeInTheDocument();
  });

  it('calls onPrimaryColorChange with the raw typed value', async () => {
    const user = userEvent.setup();
    renderWithIntl(<ControlledColorsSection initial={BRANDING} />);

    const input = screen.getByTestId('hotsite-primary-color');
    await user.clear(input);
    await user.type(input, '#000000');

    expect(input).toHaveValue('#000000');
  });

  it('clearing the optional field leaves it empty (undefined) rather than an invalid string', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <ControlledColorsSection initial={{ ...BRANDING, buttonBackgroundColor: '#111111' }} />,
    );

    const input = screen.getByTestId('hotsite-button-background-color');
    await user.clear(input);

    expect(input).toHaveValue('');
  });
});
