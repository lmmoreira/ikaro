// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceIntakeQuestionItem } from '@ikaro/types';
import { intakeFieldError, renderWithIntl } from '@/test-utils';
import { IntakeQuestionField } from './IntakeQuestionField';

const text = (required: boolean): ServiceIntakeQuestionItem => ({
  fieldKey: 'goal',
  label: 'Objetivo',
  type: 'FREE_TEXT',
  required,
});
const bool = (required: boolean): ServiceIntakeQuestionItem => ({
  fieldKey: 'flag',
  label: 'Equipamento?',
  type: 'BOOLEAN',
  required,
});

describe('IntakeQuestionField', () => {
  it('renders a required free-text question as a textarea with an error', () => {
    renderWithIntl(
      <IntakeQuestionField question={text(true)} value="" hasError onChange={vi.fn()} />,
    );

    expect(screen.getByRole('textbox', { name: /Objetivo/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(intakeFieldError('goal')).toBeInTheDocument();
  });

  it('draws a required error with the branded field message and outline, linked to the input', () => {
    renderWithIntl(
      <IntakeQuestionField question={text(true)} value="" hasError onChange={vi.fn()} />,
    );

    const input = screen.getByRole('textbox', { name: /Objetivo/ });
    const wrapper = intakeFieldError('goal');
    const message = wrapper?.querySelector('#intake-error-goal');
    expect(message).toHaveTextContent('Este campo é obrigatório.');
    expect(message?.getAttribute('style')).toContain('--ba-body-font');
    expect(input).toHaveAttribute('aria-describedby', 'intake-error-goal');
    expect(input.className).toContain('border-red-600');
  });

  it('does not outline a valid question', () => {
    renderWithIntl(
      <IntakeQuestionField question={text(true)} value="x" hasError={false} onChange={vi.fn()} />,
    );

    expect(screen.getByRole('textbox', { name: /Objetivo/ }).className).not.toContain(
      'border-red-600',
    );
  });

  it('marks an optional free-text question "(opcional)"', () => {
    renderWithIntl(
      <IntakeQuestionField question={text(false)} value="" hasError={false} onChange={vi.fn()} />,
    );

    expect(screen.getByText('(opcional)')).toBeInTheDocument();
  });

  it('reports typed text', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <IntakeQuestionField question={text(true)} value="" hasError={false} onChange={onChange} />,
    );

    await user.type(screen.getByRole('textbox'), 'a');

    expect(onChange).toHaveBeenCalledWith('a');
  });

  it('renders an optional boolean as a checkbox reporting true and false', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <IntakeQuestionField
        question={bool(false)}
        value={true}
        hasError={false}
        onChange={onChange}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Equipamento?' });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('renders a required boolean as a Sim/Não pair with nothing preselected', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <IntakeQuestionField
        question={bool(true)}
        value={undefined}
        hasError={false}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Sim' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Não' })).not.toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Não' }));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('shows "Não" as checked for a false answer and the error for a required pair', () => {
    renderWithIntl(
      <IntakeQuestionField question={bool(true)} value={false} hasError onChange={vi.fn()} />,
    );

    expect(screen.getByRole('radio', { name: 'Não' })).toBeChecked();
    expect(intakeFieldError('flag')).toBeInTheDocument();
  });
});

describe('IntakeQuestionField readable colours (TD51-S05)', () => {
  it('types in the derived secondary text colour with a branded placeholder', () => {
    renderWithIntl(
      <IntakeQuestionField question={text(false)} value="" hasError={false} onChange={vi.fn()} />,
    );

    const input = screen.getByRole('textbox', { name: /Objetivo/ });
    expect(input.style.color).toBe('var(--ba-secondary-text)');
    expect(input.className).toContain('--ba-secondary-placeholder');
  });
});
