// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  ReadOnlyField,
  SelectField,
  SuffixNumberField,
  TextareaField,
  TextField,
} from './SettingsFormFields';
import { settingsFeedback } from './settings-field-feedback.fixture';

const none = settingsFeedback();

describe('SuffixNumberField', () => {
  it('renders the suffix and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SuffixNumberField
        id="field-a"
        name="cancellationWindowHours"
        feedback={none}
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

  it('marks the input invalid and shows the message when the field has an error', () => {
    render(
      <SuffixNumberField
        id="field-a"
        name="cancellationWindowHours"
        feedback={settingsFeedback({ cancellationWindowHours: 'Valor inválido' })}
        label="Janela"
        suffix="horas"
        value="10"
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByTestId('field-a');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'cancellationWindowHours-error');
    expect(screen.getByText('Valor inválido')).toHaveAttribute(
      'id',
      'cancellationWindowHours-error',
    );
    expect(input.className).toContain('ring-red-600');
  });

  it('ignores an error recorded for another field', () => {
    render(
      <SuffixNumberField
        id="field-a"
        name="cancellationWindowHours"
        feedback={settingsFeedback({ serviceBufferMinutes: 'Outro erro' })}
        label="Janela"
        suffix="horas"
        value="10"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('field-a')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Outro erro')).not.toBeInTheDocument();
  });
});

describe('TextField', () => {
  it('renders the hint when there is no error, and the error otherwise', () => {
    const { rerender } = render(
      <TextField
        id="field-b"
        name="name"
        feedback={none}
        label="Nome"
        value=""
        hint="Dica"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Dica')).toBeInTheDocument();

    rerender(
      <TextField
        id="field-b"
        name="name"
        feedback={settingsFeedback({ name: 'Erro' })}
        label="Nome"
        value=""
        hint="Dica"
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByText('Dica')).not.toBeInTheDocument();
    expect(screen.getByText('Erro')).toBeInTheDocument();
    expect(screen.getByTestId('field-b')).toHaveAttribute('aria-invalid', 'true');
  });

  it('associates the visible hint with the input via aria-describedby, and the error takes precedence', () => {
    const { rerender } = render(
      <TextField
        id="field-b"
        name="name"
        feedback={none}
        label="Nome"
        value=""
        hint="Dica"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Dica')).toHaveAttribute('id', 'field-b-hint');
    expect(screen.getByTestId('field-b')).toHaveAttribute('aria-describedby', 'field-b-hint');

    rerender(
      <TextField
        id="field-b"
        name="name"
        feedback={settingsFeedback({ name: 'Erro' })}
        label="Nome"
        value=""
        hint="Dica"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('field-b')).toHaveAttribute('aria-describedby', 'name-error');

    rerender(
      <TextField
        id="field-b"
        name="name"
        feedback={none}
        label="Nome"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('field-b')).not.toHaveAttribute('aria-describedby');
  });
});

describe('SuffixNumberField hint association', () => {
  it('associates the visible hint with the input via aria-describedby', () => {
    render(
      <SuffixNumberField
        id="field-n"
        name="welcomeStaffScreenDays"
        feedback={none}
        label="Dias"
        hint="Dica"
        suffix="dias"
        value="1"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Dica')).toHaveAttribute('id', 'field-n-hint');
    expect(screen.getByTestId('field-n')).toHaveAttribute('aria-describedby', 'field-n-hint');
  });
});

describe('TextareaField', () => {
  it('associates the visible hint with the textarea via aria-describedby when there is no error', () => {
    render(
      <TextareaField
        id="field-c"
        name="knowledgeText"
        feedback={none}
        label="Texto"
        value=""
        hint="Dica"
        onChange={vi.fn()}
      />,
    );

    const textarea = screen.getByTestId('field-c');
    expect(screen.getByText('Dica')).toHaveAttribute('id', 'field-c-hint');
    expect(textarea).toHaveAttribute('aria-describedby', 'field-c-hint');
  });

  it('describes the error instead of the hint once one is present', () => {
    render(
      <TextareaField
        id="field-c"
        name="knowledgeText"
        feedback={settingsFeedback({ knowledgeText: 'Erro' })}
        label="Texto"
        value=""
        hint="Dica"
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByText('Dica')).not.toBeInTheDocument();
    expect(screen.getByTestId('field-c')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('field-c')).toHaveAttribute(
      'aria-describedby',
      'knowledgeText-error',
    );
  });

  it('has no aria-describedby when neither hint nor error is present', () => {
    render(
      <TextareaField
        id="field-c"
        name="knowledgeText"
        feedback={none}
        label="Texto"
        value=""
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('field-c')).not.toHaveAttribute('aria-describedby');
  });
});

describe('SelectField', () => {
  it('renders the options and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <SelectField
        id="field-c"
        name="slotGranularityMinutes"
        feedback={none}
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

  it('marks the select invalid and shows the message', () => {
    render(
      <SelectField
        id="field-c"
        name="slotGranularityMinutes"
        feedback={settingsFeedback({ slotGranularityMinutes: 'Escolha uma opção' })}
        label="Granularidade"
        value="30"
        options={[{ value: '30', label: '30 minutos' }]}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('field-c')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Escolha uma opção')).toBeInTheDocument();
  });
});

describe('ReadOnlyField', () => {
  it('renders the label and value', () => {
    render(<ReadOnlyField testId="field-d" label="Moeda" value="BRL" />);
    expect(screen.getByText('Moeda')).toBeInTheDocument();
    expect(screen.getByTestId('field-d')).toHaveTextContent('BRL');
  });
});
