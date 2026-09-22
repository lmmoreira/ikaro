// @vitest-environment jsdom
import { screen, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContactField } from './ContactField';

function baseProps() {
  return {
    htmlId: 'lead-form-name',
    testId: 'lead-form-name',
    errorTestId: 'lead-form-name-error',
    label: 'Nome',
    placeholder: 'Seu nome completo',
    value: '',
    onChange: vi.fn(),
  };
}

describe('ContactField', () => {
  it('renders the label, input, and calls onChange as the user types', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ContactField {...baseProps()} onChange={onChange} />);

    const input = screen.getByTestId('lead-form-name');
    await user.type(input, 'A');
    expect(onChange).toHaveBeenCalledWith('A');
  });

  it('shows the error message with the given errorTestId when error is set', () => {
    render(<ContactField {...baseProps()} error="Campo obrigatório" />);
    expect(screen.getByTestId('lead-form-name-error')).toHaveTextContent('Campo obrigatório');
  });

  it('does not render an error element when error is undefined', () => {
    render(<ContactField {...baseProps()} />);
    expect(screen.queryByTestId('lead-form-name-error')).not.toBeInTheDocument();
  });

  it('defaults the input type to text, and honors an explicit type', () => {
    const { rerender } = render(<ContactField {...baseProps()} />);
    expect(screen.getByTestId('lead-form-name')).toHaveAttribute('type', 'text');

    rerender(<ContactField {...baseProps()} type="email" />);
    expect(screen.getByTestId('lead-form-name')).toHaveAttribute('type', 'email');
  });
});
