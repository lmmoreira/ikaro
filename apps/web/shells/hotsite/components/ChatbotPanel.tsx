import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';
import type { HotsiteBusinessInfoResponse } from '@ikaro/types';
import { digitsOnly } from '@/shared/utils/digits-only';
import { BotIcon, CloseIcon, SendIcon } from './chatbot-icons';
import type { ChatTurn } from './chatbot-widget-storage';

// Split out of ChatbotWidget.tsx (TD37-S05, file-length/function-length) — the open-panel
// presentation (header, message list, input row, interrupted-state fallback CTA). Pure
// presentational split: all conversation state/handlers stay owned by ChatbotWidget.tsx and are
// passed down as props, so this file needs no spec of its own — ChatbotWidget.spec.tsx already
// exercises every rendering branch here through the parent.

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

interface ChatbotPanelProps {
  readonly variant: 'bubble' | 'inline';
  readonly accentColor: string;
  readonly title: string;
  readonly displayedMessages: ChatTurn[];
  readonly isInterrupted: boolean;
  readonly isSending: boolean;
  readonly business: HotsiteBusinessInfoResponse;
  readonly inputValue: string;
  readonly validationError: string | null;
  readonly bodyRef: RefObject<HTMLDivElement | null>;
  readonly inputRef: RefObject<HTMLInputElement | null>;
  readonly onInputChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onClose: () => void;
}

export function ChatbotPanel({
  variant,
  accentColor,
  title,
  displayedMessages,
  isInterrupted,
  isSending,
  business,
  inputValue,
  validationError,
  bodyRef,
  inputRef,
  onInputChange,
  onSend,
  onClose,
}: ChatbotPanelProps): React.JSX.Element {
  const t = useTranslations('hotsite');

  return (
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
            onClick={onClose}
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
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSend();
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
          onClick={onSend}
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
}
