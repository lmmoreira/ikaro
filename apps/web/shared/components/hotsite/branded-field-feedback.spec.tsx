// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandedFieldFeedback, BRANDED_FIELD_INVALID_CLASS } from './branded-field-feedback';

describe('BrandedFieldFeedback', () => {
  it('renders the message with the id aria-describedby points at', () => {
    render(
      <>
        <input aria-label="E-mail" aria-describedby="email-error" />
        <BrandedFieldFeedback id="email-error">Informe um e-mail válido.</BrandedFieldFeedback>
      </>,
    );

    expect(screen.getByLabelText('E-mail')).toHaveAccessibleDescription(
      'Informe um e-mail válido.',
    );
  });

  it('renders nothing without a message', () => {
    const { container } = render(<BrandedFieldFeedback id="email-error" />);

    expect(container).toBeEmptyDOMElement();
  });

  it('paints its own white chip and reads no tenant colour token', () => {
    const { container } = render(
      <BrandedFieldFeedback id="email-error">Erro</BrandedFieldFeedback>,
    );

    expect(screen.getByText('Erro')).toHaveStyle({ backgroundColor: '#ffffff' });
    expect(container.innerHTML).not.toMatch(/--ba-(primary|secondary|text|background)/);
  });

  it('keeps the invalid outline a fixed red, with no tenant token', () => {
    expect(BRANDED_FIELD_INVALID_CLASS).toContain('border-red-600');
    expect(BRANDED_FIELD_INVALID_CLASS).not.toContain('--ba-');
  });
});
