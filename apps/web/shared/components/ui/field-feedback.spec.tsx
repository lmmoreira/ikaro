// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FieldFeedback } from './field-feedback';

describe('FieldFeedback', () => {
  it('renders the message under the input with the id aria-describedby points at', () => {
    render(
      <>
        <input aria-label="Mínimo" aria-describedby="min-error" />
        <FieldFeedback id="min-error">Informe o mínimo</FieldFeedback>
      </>,
    );

    expect(screen.getByLabelText('Mínimo')).toHaveAccessibleDescription('Informe o mínimo');
  });

  it('carries the test id when one is given', () => {
    render(
      <FieldFeedback id="min-error" testId="min-error-testid">
        Informe o mínimo
      </FieldFeedback>,
    );

    expect(screen.getByTestId('min-error-testid')).toHaveTextContent('Informe o mínimo');
  });

  it('renders nothing without a message', () => {
    const { container } = render(<FieldFeedback id="min-error" />);

    expect(container).toBeEmptyDOMElement();
  });
});
