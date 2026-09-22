// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { SettingsChatbotSection } from './SettingsChatbotSection';

describe('SettingsChatbotSection', () => {
  it('renders the knowledge text field pre-filled with the initial value', () => {
    renderWithIntl(
      <SettingsChatbotSection
        knowledgeText="Aceitamos Pix e cartão."
        knowledgeTextError={undefined}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Sobre o seu negócio')).toHaveValue('Aceitamos Pix e cartão.');
  });

  it('calls onChange as the user edits the field, with no maxLength cap', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <SettingsChatbotSection
        knowledgeText=""
        knowledgeTextError={undefined}
        onChange={onChange}
      />,
    );

    const field = screen.getByLabelText('Sobre o seu negócio');
    expect(field).not.toHaveAttribute('maxLength');

    await user.type(field, 'x');
    expect(onChange).toHaveBeenCalledWith('x');
  });

  it('renders the field-level validation error instead of the hint when present', () => {
    renderWithIntl(
      <SettingsChatbotSection
        knowledgeText={'a'.repeat(4001)}
        knowledgeTextError="O texto de conhecimento do assistente excede o limite de caracteres permitido."
        onChange={vi.fn()}
      />,
    );

    expect(
      screen.getByText(
        'O texto de conhecimento do assistente excede o limite de caracteres permitido.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Políticas, perguntas frequentes/)).not.toBeInTheDocument();
  });

  it('renders the caps-elsewhere advisory note', () => {
    renderWithIntl(
      <SettingsChatbotSection knowledgeText="" knowledgeTextError={undefined} onChange={vi.fn()} />,
    );

    expect(screen.getByText(/não aparecem neste formulário/)).toBeInTheDocument();
  });
});
