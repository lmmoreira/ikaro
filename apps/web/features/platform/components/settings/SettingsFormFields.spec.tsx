// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  FieldError,
  ReadOnlyField,
  SelectField,
  SuffixNumberField,
  TextField,
} from './SettingsFormFields';

describe('FieldError', () => {
  it('renders nothing when there is no message', () => {
    const { container } = render(<FieldError id="err" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the message when present', () => {
    render(<FieldError id="err" message="Campo obrigatório" />);
    expect(screen.getByTestId('err')).toHaveTextContent('Campo obrigatório');
  });
});

describe('SuffixNumberField', () => {
  it('renders the suffix and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SuffixNumberField
        id="field-a"
        label="Janela"
        suffix="horas"
        value="10"
        onChange={onChange}
      />,
    );

    expect(screen.getByText('horas')).toBeInTheDocument();
    await user.type(screen.getByTestId('field-a'), '5');
    expect(onChange).toHaveBeenCalled();
  });
});

describe('TextField', () => {
  it('renders the hint when there is no error, and the error otherwise', () => {
    const { rerender } = render(
      <TextField id="field-b" label="Nome" value="" hint="Dica" onChange={vi.fn()} />,
    );
    expect(screen.getByText('Dica')).toBeInTheDocument();

    rerender(
      <TextField id="field-b" label="Nome" value="" hint="Dica" error="Erro" onChange={vi.fn()} />,
    );
    expect(screen.queryByText('Dica')).not.toBeInTheDocument();
    expect(screen.getByTestId('field-b-error')).toHaveTextContent('Erro');
  });
});

describe('SelectField', () => {
  it('renders the options and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectField
        id="field-c"
        label="Granularidade"
        value="30"
        options={[
          { value: '15', label: '15 minutos' },
          { value: '30', label: '30 minutos' },
        ]}
        onChange={onChange}
      />,
    );

    await user.selectOptions(screen.getByTestId('field-c'), '15');
    expect(onChange).toHaveBeenCalledWith('15');
  });
});

describe('ReadOnlyField', () => {
  it('renders the label and value', () => {
    render(<ReadOnlyField testId="field-d" label="Moeda" value="BRL" />);
    expect(screen.getByText('Moeda')).toBeInTheDocument();
    expect(screen.getByTestId('field-d')).toHaveTextContent('BRL');
  });
});
