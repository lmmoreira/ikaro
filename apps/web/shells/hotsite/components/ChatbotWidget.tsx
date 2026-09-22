'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ChatbotModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import {
  fetchChatbotStatusClient,
  sendChatbotMessageClient,
} from '@/features/platform/hotsite/api/chatbot';
import { ApiError } from '@/shared/lib/api/errors';
import { BotIcon } from './chatbot-icons';
import { ChatbotPanel } from './ChatbotPanel';
import {
  type ChatTurn,
  messagesKey,
  readStoredMessages,
  sessionIdKey,
} from './chatbot-widget-storage';

interface ChatbotWidgetProps {
  readonly data: ChatbotModuleData;
  readonly slug: string;
  readonly business: HotsiteBusinessInfoResponse;
  readonly tenantName: string;
}

// checking/unavailable: pre-flight in flight or resolved false — widget renders null either way
// (UC-034). idle/sending/interrupted: the 3 states the prototype validates (docs/15 § CHATBOT).
type ConversationStatus = 'checking' | 'unavailable' | 'idle' | 'sending' | 'interrupted';

export function ChatbotWidget({
  data,
  slug,
  business,
  tenantName,
}: ChatbotWidgetProps): React.JSX.Element | null {
  const t = useTranslations('hotsite');
  const variant = data.variant ?? 'bubble';
  const accentColor =
    data.accentColor === 'secondary' ? 'var(--ba-secondary)' : 'var(--ba-primary)';
  const title = `${data.botName ?? tenantName} ${t('chatbot.titleSuffix')}`;

  const [status, setStatus] = useState<ConversationStatus>('checking');
  // Only meaningful for variant 'bubble' — 'inline' always renders expanded, no collapse state.
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  // Set once, from what sessionStorage actually held at mount — never recomputed from
  // messages.length afterward, so the welcome bubble stays visible once the visitor starts
  // typing (it's a pure display-time prepend, never pushed into `messages` itself: never
  // persisted to sessionStorage, never sent to the backend). A resumed conversation (real
  // history already in sessionStorage) never gets a synthetic greeting injected in front of it.
  const [isFreshConversation, setIsFreshConversation] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Always-fresh pre-flight on mount (never cached, unlike the manifest — UC-034). A visitor
  // never sees a chat button that then fails when clicked: nothing renders until this resolves.
  useEffect(() => {
    let cancelled = false;

    fetchChatbotStatusClient(slug)
      .then((res) => {
        if (cancelled) return;
        if (!res.available) {
          setStatus('unavailable');
          return;
        }
        sessionIdRef.current = sessionStorage.getItem(sessionIdKey(slug));
        const restored = readStoredMessages(slug);
        setIsFreshConversation(restored.length === 0);
        setMessages(restored);
        setStatus('idle');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Client-side transcript cache (resolved at M19-S11 story-discovery): the backend already
  // rebuilds conversation history from chatbot_messages by sessionId on every message, so a
  // reload never loses cap-enforcement/LLM memory — only the *visible* transcript needs this,
  // since messages is otherwise plain component state.
  useEffect(() => {
    if (status === 'checking' || status === 'unavailable') return;
    sessionStorage.setItem(messagesKey(slug), JSON.stringify(messages));
  }, [messages, slug, status]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, status]);

  // Returns focus to the input after every reply (and after a 400 rollback restores the draft)
  // so a visitor can keep typing without re-clicking — never while sending (avoid stealing focus
  // mid-request) or interrupted (input is disabled). For the bubble variant this also fires when
  // the panel is first opened, since status is already 'idle' by the time that happens.
  useEffect(() => {
    if (status !== 'idle') return;
    if (variant === 'bubble' && !isOpen) return;
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    const caretPosition = input.value.length;
    input.setSelectionRange(caretPosition, caretPosition);
  }, [status, isOpen, variant]);

  async function handleSend(): Promise<void> {
    const message = inputValue.trim();
    if (!message || status === 'sending' || status === 'interrupted') return;

    setValidationError(null);
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', content: message }]);
    setInputValue('');
    setStatus('sending');

    try {
      const res = await sendChatbotMessageClient(slug, {
        sessionId: sessionIdRef.current ?? undefined,
        message,
      });
      sessionIdRef.current = res.sessionId;
      sessionStorage.setItem(sessionIdKey(slug), res.sessionId);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: res.reply },
      ]);
      setStatus('idle');
    } catch (err) {
      // 400 (message too long): not conversation-ending — roll back the optimistic bubble,
      // restore the draft, keep input enabled (UC-033 A3). Every other failure (429 cap, 503
      // provider) moves to the interrupted state (UC-033 A1/A2/A4). err.detail is backend-internal
      // debug text and must never be rendered (docs/CODE_STANDARDS.md) — always a fixed copy key.
      if (err instanceof ApiError && err.status === 400) {
        setMessages((prev) => prev.slice(0, -1));
        setInputValue(message);
        setValidationError(t('chatbot.messageTooLong'));
        setStatus('idle');
        return;
      }
      setStatus('interrupted');
    }
  }

  if (status === 'checking' || status === 'unavailable') return null;

  if (variant === 'bubble' && !isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        title={title}
        data-testid="chatbot-bubble-button"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border-none shadow-lg"
        style={{ backgroundColor: accentColor, color: 'var(--ba-btn-text)' }}
      >
        {BotIcon}
      </button>
    );
  }

  const displayedMessages: ChatTurn[] = isFreshConversation
    ? [
        {
          id: 'welcome',
          role: 'assistant',
          content: data.welcomeMessage ?? t('chatbot.defaultWelcomeMessage'),
        },
        ...messages,
      ]
    : messages;

  const panel = (
    <ChatbotPanel
      variant={variant}
      accentColor={accentColor}
      title={title}
      displayedMessages={displayedMessages}
      isInterrupted={status === 'interrupted'}
      isSending={status === 'sending'}
      business={business}
      inputValue={inputValue}
      validationError={validationError}
      bodyRef={bodyRef}
      inputRef={inputRef}
      onInputChange={setInputValue}
      onSend={() => void handleSend()}
      onClose={() => setIsOpen(false)}
    />
  );

  if (variant === 'inline') {
    return (
      <section
        id="chatbot"
        style={{ backgroundColor: 'var(--ba-background)', padding: 'var(--ba-section-py) 1.5rem' }}
      >
        <div className="mx-auto max-w-7xl">
          <h2
            className="mb-1 text-center text-2xl font-bold"
            style={{ color: 'var(--ba-text)', fontFamily: 'var(--ba-heading-font)' }}
          >
            {t('chatbot.inlineHeading')}
          </h2>
          <p className="mb-6 text-center text-sm opacity-60" style={{ color: 'var(--ba-text)' }}>
            {t('chatbot.inlineSubheading')}
          </p>
          {panel}
        </div>
      </section>
    );
  }

  return panel;
}
