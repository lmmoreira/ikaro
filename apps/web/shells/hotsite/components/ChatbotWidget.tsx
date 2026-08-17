'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ChatbotModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import {
  fetchChatbotStatusClient,
  sendChatbotMessageClient,
} from '@/features/platform/hotsite/api/chatbot';
import { ApiError } from '@/shared/lib/api/errors';
import { digitsOnly } from '@/shared/utils/digits-only';

interface ChatTurn {
  // Stable React key (SonarCloud S6479 — array index is not a valid key once messages can be
  // rolled back on a 400, which removes an item from the middle of the array, not just appends).
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

interface ChatbotWidgetProps {
  readonly data: ChatbotModuleData;
  readonly slug: string;
  readonly business: HotsiteBusinessInfoResponse;
  readonly tenantName: string;
}

// checking/unavailable: pre-flight in flight or resolved false — widget renders null either way
// (UC-034). idle/sending/interrupted: the 3 states the prototype validates (docs/15 § CHATBOT).
type ConversationStatus = 'checking' | 'unavailable' | 'idle' | 'sending' | 'interrupted';

// Scoped per tenant slug: a visitor can browse two tenants' hotsites in the same browser tab
// sequence (no full reload required between them), so a bare, unscoped key would leak one
// tenant's session/transcript into another's widget.
function sessionIdKey(slug: string): string {
  return `ikaro-chatbot-session-id:${slug}`;
}

function messagesKey(slug: string): string {
  return `ikaro-chatbot-messages:${slug}`;
}

// Backfills `id` for a transcript stored before this field existed — sessionStorage can
// legitimately hold that older shape across a hot-reload/deploy within the same tab session.
function readStoredMessages(slug: string): ChatTurn[] {
  try {
    const raw = sessionStorage.getItem(messagesKey(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ReadonlyArray<
      Partial<ChatTurn> & Pick<ChatTurn, 'role' | 'content'>
    >;
    return parsed.map((turn) => ({ id: turn.id ?? crypto.randomUUID(), ...turn }));
  } catch {
    return [];
  }
}

const BotIcon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
);

const CloseIcon = (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const SendIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

interface FallbackCtaProps {
  readonly business: HotsiteBusinessInfoResponse;
}

// Interrupted-state fallback contact — reuses the manifest's already-resolved business.phone /
// business.socialLinks.whatsapp (docs/15 § CONTACT's resolution path), never a new field.
// WhatsApp preferred when both are set, matching ContactModule's own display precedent.
function FallbackCta({ business }: FallbackCtaProps): React.JSX.Element | null {
  const t = useTranslations('hotsite');
  const whatsapp = business.socialLinks?.whatsapp;

  if (whatsapp) {
    return (
      <a
        href={`https://wa.me/${digitsOnly(whatsapp)}`}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="chatbot-whatsapp-cta"
        className="self-center rounded-full px-5 py-2.5 text-sm font-semibold text-white no-underline"
        style={{ backgroundColor: '#25D366' }}
      >
        {t('chatbot.whatsappFallbackCta')}
      </a>
    );
  }

  if (business.phone) {
    return (
      <a
        href={`tel:${digitsOnly(business.phone)}`}
        data-testid="chatbot-phone-cta"
        className="self-center rounded-full px-5 py-2.5 text-sm font-semibold no-underline"
        style={{ backgroundColor: 'var(--ba-primary)', color: 'var(--ba-btn-text)' }}
      >
        {t('chatbot.phoneFallbackCta')}
      </a>
    );
  }

  return null;
}

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
  const [inputValue, setInputValue] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

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
        setMessages(readStoredMessages(slug));
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

  const isInterrupted = status === 'interrupted';
  const isSending = status === 'sending';
  const displayedMessages: ChatTurn[] =
    messages.length === 0
      ? [
          {
            id: 'welcome',
            role: 'assistant',
            content: data.welcomeMessage ?? t('chatbot.defaultWelcomeMessage'),
          },
        ]
      : messages;

  const panel = (
    <div
      className={
        variant === 'bubble'
          ? 'fixed bottom-6 right-6 z-50 flex h-[32rem] max-h-[calc(100vh-3rem)] w-[23rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden shadow-2xl'
          : 'mx-auto flex h-80 w-full max-w-2xl flex-col overflow-hidden border shadow-sm'
      }
      style={{
        backgroundColor: 'var(--ba-background)',
        borderRadius: 'var(--ba-radius)',
        borderColor: variant === 'inline' ? 'var(--ba-secondary)' : undefined,
      }}
      data-testid="chatbot-panel"
    >
      <div
        className="flex items-center gap-2.5 px-5 py-3.5"
        style={{ backgroundColor: accentColor, color: 'var(--ba-btn-text)' }}
      >
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
          {BotIcon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.9375rem] font-bold leading-tight">{title}</div>
        </div>
        {variant === 'bubble' && (
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            title={t('chatbot.closeButtonLabel')}
            aria-label={t('chatbot.closeButtonLabel')}
            data-testid="chatbot-close-button"
            className="border-none bg-transparent opacity-85"
            style={{ color: 'var(--ba-btn-text)' }}
          >
            {CloseIcon}
          </button>
        )}
      </div>

      <div
        ref={bodyRef}
        className="flex flex-1 flex-col gap-3 overflow-y-auto p-4"
        style={{ backgroundColor: 'var(--ba-secondary)' }}
      >
        {displayedMessages.map((turn) => (
          <div
            key={turn.id}
            data-testid="chatbot-message"
            data-role={turn.role}
            className={
              turn.role === 'user'
                ? 'max-w-[82%] self-end rounded-2xl rounded-br-sm px-3.5 py-2.5 text-sm'
                : 'max-w-[82%] self-start rounded-2xl rounded-bl-sm border px-3.5 py-2.5 text-sm'
            }
            style={
              turn.role === 'user'
                ? { backgroundColor: accentColor, color: 'var(--ba-btn-text)' }
                : {
                    backgroundColor: 'var(--ba-background)',
                    borderColor: 'var(--ba-secondary)',
                    color: 'var(--ba-text)',
                  }
            }
          >
            {turn.content}
          </div>
        ))}

        {isInterrupted && (
          <>
            <div
              data-testid="chatbot-interrupted-notice"
              className="self-center rounded-xl px-4 py-3 text-center text-[0.8125rem]"
              style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
            >
              {t('chatbot.interruptedMessage')}
            </div>
            <FallbackCta business={business} />
          </>
        )}
      </div>

      <div className="flex gap-2 border-t p-3" style={{ borderColor: 'var(--ba-secondary)' }}>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSend();
          }}
          disabled={isInterrupted || isSending}
          placeholder={
            isInterrupted ? t('chatbot.interruptedInputPlaceholder') : t('chatbot.inputPlaceholder')
          }
          aria-label={t('chatbot.inputPlaceholder')}
          data-testid="chatbot-message-input"
          className="flex-1 rounded-full border px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            borderColor: 'var(--ba-secondary)',
            backgroundColor: 'var(--ba-background)',
            color: 'var(--ba-text)',
          }}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={isInterrupted || isSending || !inputValue.trim()}
          title={t('chatbot.sendButtonLabel')}
          aria-label={t('chatbot.sendButtonLabel')}
          data-testid="chatbot-send-button"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-none disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: accentColor, color: 'var(--ba-btn-text)' }}
        >
          {SendIcon}
        </button>
      </div>
      {validationError && (
        <div
          data-testid="chatbot-validation-error"
          className="px-4 pb-3 text-center text-xs"
          style={{ color: '#dc2626' }}
        >
          {validationError}
        </div>
      )}
    </div>
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
