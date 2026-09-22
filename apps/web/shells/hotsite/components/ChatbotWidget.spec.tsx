// @vitest-environment jsdom
import MockAdapter from 'axios-mock-adapter';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatbotModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import { axe } from '@/axe-helper';
import { bffClient } from '@/shared/lib/api/bff-client';
import { ChatbotWidget } from './ChatbotWidget';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      'chatbot.titleSuffix': '— Assistente IA',
      'chatbot.defaultWelcomeMessage': 'Olá! Como posso ajudar?',
      'chatbot.inputPlaceholder': 'Digite sua mensagem...',
      'chatbot.sendButtonLabel': 'Enviar',
      'chatbot.closeButtonLabel': 'Fechar',
      'chatbot.interruptedMessage': 'Esta conversa foi interrompida.',
      'chatbot.interruptedInputPlaceholder': 'Conversa interrompida',
      'chatbot.whatsappFallbackCta': 'Falar no WhatsApp',
      'chatbot.phoneFallbackCta': 'Ligar agora',
      'chatbot.messageTooLong': 'Mensagem muito longa.',
      'chatbot.inlineHeading': 'Tire suas dúvidas',
      'chatbot.inlineSubheading': 'Converse com nosso assistente',
    };
    return values ? `${map[key] ?? key} ${JSON.stringify(values)}` : (map[key] ?? key);
  },
}));

const SLUG = 'lavacar-beloauto';
const TENANT_NAME = 'BeloAuto';

function makeBusiness(
  overrides?: Partial<HotsiteBusinessInfoResponse>,
): HotsiteBusinessInfoResponse {
  return {
    phone: '11999990000',
    email: 'contato@beloauto.com.br',
    address: null,
    socialLinks: { whatsapp: '5511999990000', instagram: null, facebook: null },
    ...overrides,
  };
}

function makeData(overrides?: Partial<ChatbotModuleData>): ChatbotModuleData {
  return { ...overrides };
}

const mock = new MockAdapter(bffClient);

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  mock.reset();
});

describe('ChatbotWidget', () => {
  describe('not-available state (UC-034)', () => {
    it('renders nothing while the pre-flight check is in flight', () => {
      mock.onGet('/public/platform/chatbot/status').reply(() => new Promise(() => {}));

      const { container } = render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when the pre-flight check resolves available: false', async () => {
      mock.onGet('/public/platform/chatbot/status').reply(200, { available: false });

      const { container } = render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await waitFor(() => expect(container).toBeEmptyDOMElement());
      expect(screen.queryByTestId('chatbot-bubble-button')).not.toBeInTheDocument();
    });

    it('renders nothing when the pre-flight check fails outright', async () => {
      mock.onGet('/public/platform/chatbot/status').reply(500);

      const { container } = render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await waitFor(() => expect(container).toBeEmptyDOMElement());
    });
  });

  describe('active chat state — variant bubble (UC-033/UC-034)', () => {
    beforeEach(() => {
      mock.onGet('/public/platform/chatbot/status').reply(200, { available: true });
    });

    it('renders a collapsed bubble button, not the panel, until clicked', async () => {
      render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await screen.findByTestId('chatbot-bubble-button');
      expect(screen.queryByTestId('chatbot-panel')).not.toBeInTheDocument();
    });

    it('opens the panel on click, showing the widget title and default welcome message', async () => {
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));

      expect(await screen.findByTestId('chatbot-panel')).toBeInTheDocument();
      expect(screen.getByText('BeloAuto — Assistente IA')).toBeInTheDocument();
      expect(screen.getByText('Olá! Como posso ajudar?')).toBeInTheDocument();
    });

    it('uses botName over tenantName when set', async () => {
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData({ botName: 'Sofia' })}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));

      expect(screen.getByText('Sofia — Assistente IA')).toBeInTheDocument();
    });

    it('shows a custom welcomeMessage when set', async () => {
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData({ welcomeMessage: 'Bem-vindo à BeloAuto!' })}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));

      expect(screen.getByText('Bem-vindo à BeloAuto!')).toBeInTheDocument();
    });

    // The welcome text is a pure display-time prepend (never pushed into `messages`), so it's
    // never persisted to sessionStorage or sent to the backend — it only needs to keep rendering
    // once a fresh conversation has real turns too, not disappear the moment one exists.
    it('keeps the welcome message visible once the visitor sends their first message', async () => {
      mock
        .onPost('/public/platform/chatbot/messages')
        .reply(200, { sessionId: 'session-1', reply: 'Sim! Abrimos aos sábados.' });
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData({ welcomeMessage: 'Bem-vindo à BeloAuto!' })}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));
      await user.type(screen.getByTestId('chatbot-message-input'), 'Vocês abrem aos sábados?');
      await user.click(screen.getByTestId('chatbot-send-button'));

      expect(await screen.findByText('Sim! Abrimos aos sábados.')).toBeInTheDocument();
      expect(screen.getByText('Bem-vindo à BeloAuto!')).toBeInTheDocument();
    });

    it('sends a message, shows the optimistic user bubble, then the assistant reply, and closes with the close button', async () => {
      mock
        .onPost('/public/platform/chatbot/messages')
        .reply(200, { sessionId: 'session-1', reply: 'Sim! Abrimos aos sábados.' });
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));
      await user.type(screen.getByTestId('chatbot-message-input'), 'Vocês abrem aos sábados?');
      await user.click(screen.getByTestId('chatbot-send-button'));

      expect(await screen.findByText('Vocês abrem aos sábados?')).toBeInTheDocument();
      expect(await screen.findByText('Sim! Abrimos aos sábados.')).toBeInTheDocument();
      expect(sessionStorage.getItem(`ikaro-chatbot-session-id:${SLUG}`)).toBe('session-1');

      await user.click(screen.getByTestId('chatbot-close-button'));
      expect(screen.queryByTestId('chatbot-panel')).not.toBeInTheDocument();
      expect(await screen.findByTestId('chatbot-bubble-button')).toBeInTheDocument();
    });

    it('opens with the input focused, and refocuses it after the reply arrives so the visitor can keep typing', async () => {
      mock
        .onPost('/public/platform/chatbot/messages')
        .reply(200, { sessionId: 'session-1', reply: 'Sim! Abrimos aos sábados.' });
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));
      const input = await screen.findByTestId('chatbot-message-input');
      expect(input).toHaveFocus();

      await user.type(input, 'Vocês abrem aos sábados?');
      await user.click(screen.getByTestId('chatbot-send-button'));
      await screen.findByText('Sim! Abrimos aos sábados.');

      expect(input).toHaveFocus();
    });

    it('sends the stored sessionId on a subsequent message', async () => {
      sessionStorage.setItem(`ikaro-chatbot-session-id:${SLUG}`, 'existing-session');
      mock
        .onPost('/public/platform/chatbot/messages')
        .reply(200, { sessionId: 'existing-session', reply: 'Claro!' });
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));
      await user.type(screen.getByTestId('chatbot-message-input'), 'E aos domingos?');
      await user.click(screen.getByTestId('chatbot-send-button'));

      await screen.findByText('Claro!');
      expect(JSON.parse(mock.history.post?.[0]?.data)).toEqual({
        sessionId: 'existing-session',
        message: 'E aos domingos?',
      });
    });

    it('has no axe violations once the panel is open', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));
      await screen.findByTestId('chatbot-panel');

      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('interrupted state (UC-033 A1/A2/A4)', () => {
    beforeEach(() => {
      mock.onGet('/public/platform/chatbot/status').reply(200, { available: true });
    });

    it('moves to interrupted on a 429 (cap exceeded), disables input, and shows the WhatsApp fallback', async () => {
      mock.onPost('/public/platform/chatbot/messages').reply(429);
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));
      await user.type(screen.getByTestId('chatbot-message-input'), 'Oi');
      await user.click(screen.getByTestId('chatbot-send-button'));

      expect(await screen.findByTestId('chatbot-interrupted-notice')).toBeInTheDocument();
      expect(screen.getByTestId('chatbot-message-input')).toBeDisabled();
      expect(screen.getByTestId('chatbot-send-button')).toBeDisabled();
      expect(screen.getByTestId('chatbot-whatsapp-cta')).toHaveAttribute(
        'href',
        'https://wa.me/5511999990000',
      );
    });

    it('moves to interrupted on a 503 (provider failure mid-conversation)', async () => {
      mock.onPost('/public/platform/chatbot/messages').reply(503);
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));
      await user.type(screen.getByTestId('chatbot-message-input'), 'Oi');
      await user.click(screen.getByTestId('chatbot-send-button'));

      expect(await screen.findByTestId('chatbot-interrupted-notice')).toBeInTheDocument();
    });

    it('falls back to the phone CTA when no WhatsApp number is configured', async () => {
      mock.onPost('/public/platform/chatbot/messages').reply(429);
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness({
            socialLinks: { whatsapp: null, instagram: null, facebook: null },
          })}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));
      await user.type(screen.getByTestId('chatbot-message-input'), 'Oi');
      await user.click(screen.getByTestId('chatbot-send-button'));

      expect(await screen.findByTestId('chatbot-phone-cta')).toHaveAttribute(
        'href',
        'tel:11999990000',
      );
      expect(screen.queryByTestId('chatbot-whatsapp-cta')).not.toBeInTheDocument();
    });

    it('shows no fallback CTA at all when neither WhatsApp nor phone is configured', async () => {
      mock.onPost('/public/platform/chatbot/messages').reply(429);
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness({
            phone: null,
            socialLinks: { whatsapp: null, instagram: null, facebook: null },
          })}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));
      await user.type(screen.getByTestId('chatbot-message-input'), 'Oi');
      await user.click(screen.getByTestId('chatbot-send-button'));

      await screen.findByTestId('chatbot-interrupted-notice');
      expect(screen.queryByTestId('chatbot-whatsapp-cta')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chatbot-phone-cta')).not.toBeInTheDocument();
    });

    it('a 400 (message too long) is not conversation-ending — input stays enabled and the draft is restored', async () => {
      mock.onPost('/public/platform/chatbot/messages').reply(400);
      const user = userEvent.setup();
      render(
        <ChatbotWidget
          data={makeData()}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await user.click(await screen.findByTestId('chatbot-bubble-button'));
      await user.type(screen.getByTestId('chatbot-message-input'), 'Mensagem muito longa aqui');
      await user.click(screen.getByTestId('chatbot-send-button'));

      expect(await screen.findByText('Mensagem muito longa.')).toBeInTheDocument();
      expect(screen.getByTestId('chatbot-message-input')).not.toBeDisabled();
      expect(screen.getByTestId('chatbot-message-input')).toHaveValue('Mensagem muito longa aqui');
      expect(screen.queryByTestId('chatbot-interrupted-notice')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Mensagem muito longa aqui', { selector: '[data-role="user"]' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('variant inline', () => {
    it('renders the panel directly (no bubble button) inside its own section', async () => {
      mock.onGet('/public/platform/chatbot/status').reply(200, { available: true });

      render(
        <ChatbotWidget
          data={makeData({ variant: 'inline' })}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      expect(await screen.findByTestId('chatbot-panel')).toBeInTheDocument();
      expect(screen.queryByTestId('chatbot-bubble-button')).not.toBeInTheDocument();
      expect(screen.queryByTestId('chatbot-close-button')).not.toBeInTheDocument();
      expect(screen.getByText('Tire suas dúvidas')).toBeInTheDocument();
    });

    it('renders nothing when unavailable, same as the bubble variant', async () => {
      mock.onGet('/public/platform/chatbot/status').reply(200, { available: false });

      const { container } = render(
        <ChatbotWidget
          data={makeData({ variant: 'inline' })}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      await waitFor(() => expect(container).toBeEmptyDOMElement());
    });
  });

  describe('reload transcript persistence', () => {
    it('restores the visible transcript from sessionStorage on mount', async () => {
      sessionStorage.setItem(
        `ikaro-chatbot-messages:${SLUG}`,
        JSON.stringify([
          { role: 'user', content: 'Vocês abrem aos domingos?' },
          { role: 'assistant', content: 'Não, apenas de segunda a sábado.' },
        ]),
      );
      mock.onGet('/public/platform/chatbot/status').reply(200, { available: true });

      render(
        <ChatbotWidget
          data={makeData({ variant: 'inline' })}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      expect(await screen.findByText('Vocês abrem aos domingos?')).toBeInTheDocument();
      expect(screen.getByText('Não, apenas de segunda a sábado.')).toBeInTheDocument();
      expect(screen.queryByText('Olá! Como posso ajudar?')).not.toBeInTheDocument();
    });

    it('starts with an empty transcript instead of crashing when sessionStorage holds corrupted JSON', async () => {
      sessionStorage.setItem(`ikaro-chatbot-messages:${SLUG}`, '{not valid json');
      mock.onGet('/public/platform/chatbot/status').reply(200, { available: true });

      render(
        <ChatbotWidget
          data={makeData({ variant: 'inline' })}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      expect(await screen.findByText('Olá! Como posso ajudar?')).toBeInTheDocument();
    });

    // PR #385 review (Codex): syntactically valid JSON with a malformed turn shape (content as
    // an object, an unknown role) previously reached JSX unchecked and crashed the widget.
    it('discards malformed turns instead of crashing, keeping only well-formed ones', async () => {
      sessionStorage.setItem(
        `ikaro-chatbot-messages:${SLUG}`,
        JSON.stringify([
          { role: 'user', content: 'Oi' },
          { role: 'assistant', content: { nested: 'object' } },
          { role: 'unknown-role', content: 'ignored' },
          { role: 'assistant', content: 'Como posso ajudar?' },
        ]),
      );
      mock.onGet('/public/platform/chatbot/status').reply(200, { available: true });

      render(
        <ChatbotWidget
          data={makeData({ variant: 'inline' })}
          slug={SLUG}
          business={makeBusiness()}
          tenantName={TENANT_NAME}
        />,
      );

      expect(await screen.findByText('Oi')).toBeInTheDocument();
      expect(screen.getByText('Como posso ajudar?')).toBeInTheDocument();
      expect(screen.getAllByTestId('chatbot-message')).toHaveLength(2);
    });
  });
});
