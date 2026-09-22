// @vitest-environment jsdom
import { createRef } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteBusinessInfoResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ChatbotPanel } from './ChatbotPanel';
import type { ChatTurn } from './chatbot-widget-storage';

function makeBusiness(
  overrides?: Partial<HotsiteBusinessInfoResponse>,
): HotsiteBusinessInfoResponse {
  return {
    phone: '11987654321',
    email: 'contato@beloauto.com.br',
    address: null,
    socialLinks: { whatsapp: '11987654321', instagram: null, facebook: null },
    ...overrides,
  };
}

const welcomeMessage: ChatTurn = { id: 'welcome', role: 'assistant', content: 'Olá!' };

function baseProps(overrides?: Partial<React.ComponentProps<typeof ChatbotPanel>>) {
  return {
    variant: 'bubble' as const,
    accentColor: '#2563eb',
    title: 'Assistente IA',
    displayedMessages: [welcomeMessage],
    isInterrupted: false,
    isSending: false,
    business: makeBusiness(),
    inputValue: '',
    validationError: null,
    bodyRef: createRef<HTMLDivElement>(),
    inputRef: createRef<HTMLInputElement>(),
    onInputChange: vi.fn(),
    onSend: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('ChatbotPanel', () => {
  it('renders the title and each message', () => {
    renderWithIntl(<ChatbotPanel {...baseProps()} />);

    expect(screen.getByText('Assistente IA')).toBeInTheDocument();
    expect(screen.getByText('Olá!')).toBeInTheDocument();
  });

  it('renders a close button for the bubble variant and calls onClose when clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(<ChatbotPanel {...baseProps({ variant: 'bubble', onClose })} />);

    await user.click(screen.getByTestId('chatbot-close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders no close button for the inline variant', () => {
    renderWithIntl(<ChatbotPanel {...baseProps({ variant: 'inline' })} />);

    expect(screen.queryByTestId('chatbot-close-button')).not.toBeInTheDocument();
  });

  it('calls onInputChange as the user types', async () => {
    const user = userEvent.setup();
    const onInputChange = vi.fn();
    renderWithIntl(<ChatbotPanel {...baseProps({ onInputChange })} />);

    await user.type(screen.getByTestId('chatbot-message-input'), 'x');

    expect(onInputChange).toHaveBeenCalled();
  });

  it('calls onSend when Enter is pressed in the input', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    renderWithIntl(<ChatbotPanel {...baseProps({ inputValue: 'Olá', onSend })} />);

    await user.type(screen.getByTestId('chatbot-message-input'), '{Enter}');

    expect(onSend).toHaveBeenCalled();
  });

  it('disables input and send button while sending', () => {
    renderWithIntl(<ChatbotPanel {...baseProps({ isSending: true, inputValue: 'Olá' })} />);

    expect(screen.getByTestId('chatbot-message-input')).toBeDisabled();
    expect(screen.getByTestId('chatbot-send-button')).toBeDisabled();
  });

  it('disables the send button when the input is blank', () => {
    renderWithIntl(<ChatbotPanel {...baseProps({ inputValue: '  ' })} />);

    expect(screen.getByTestId('chatbot-send-button')).toBeDisabled();
  });

  it('renders the interrupted notice and a WhatsApp fallback CTA when isInterrupted', () => {
    renderWithIntl(<ChatbotPanel {...baseProps({ isInterrupted: true })} />);

    expect(screen.getByTestId('chatbot-interrupted-notice')).toBeInTheDocument();
    expect(screen.getByTestId('chatbot-whatsapp-cta')).toHaveAttribute(
      'href',
      'https://wa.me/11987654321',
    );
    expect(screen.getByTestId('chatbot-message-input')).toBeDisabled();
  });

  it('renders no interrupted notice when not interrupted', () => {
    renderWithIntl(<ChatbotPanel {...baseProps({ isInterrupted: false })} />);

    expect(screen.queryByTestId('chatbot-interrupted-notice')).not.toBeInTheDocument();
  });

  it('renders the validation error message when set', () => {
    renderWithIntl(<ChatbotPanel {...baseProps({ validationError: 'Mensagem muito longa' })} />);

    expect(screen.getByTestId('chatbot-validation-error')).toHaveTextContent(
      'Mensagem muito longa',
    );
  });

  it('renders no validation error element when null', () => {
    renderWithIntl(<ChatbotPanel {...baseProps({ validationError: null })} />);

    expect(screen.queryByTestId('chatbot-validation-error')).not.toBeInTheDocument();
  });

  it('renders one message row per entry in displayedMessages, tagged by role', () => {
    renderWithIntl(
      <ChatbotPanel
        {...baseProps({
          displayedMessages: [welcomeMessage, { id: 'u1', role: 'user', content: 'Quero agendar' }],
        })}
      />,
    );

    const rows = screen.getAllByTestId('chatbot-message');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveAttribute('data-role', 'assistant');
    expect(rows[1]).toHaveAttribute('data-role', 'user');
  });
});
