import type React from 'react';
import type { AvailableSlot, HotsiteServiceResponse } from '@ikaro/types';
import { ErrorAlert } from './ErrorAlert';
import { formatDateLongBR, formatTimeBR } from '@/lib/booking/format-time';
import { formatDuration } from '@/lib/hotsite/format-duration';
import { formatBRL } from '@/lib/hotsite/format-money';

export type BookingSubmissionStatus = 'idle' | 'submitting' | 'success' | 'error';

interface ConfirmationStepProps {
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string;
  readonly selectedSlot: AvailableSlot;
  readonly status: BookingSubmissionStatus;
  readonly errorMessage: string | null;
  readonly onSubmit: () => void;
  readonly onBack: () => void;
}

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

export function ConfirmationStep({
  slug,
  services,
  selectedServiceIds,
  selectedDate,
  selectedSlot,
  status,
  errorMessage,
  onSubmit,
  onBack,
}: ConfirmationStepProps) {
  const selected = services.filter((service) => selectedServiceIds.includes(service.id));
  const totalAmount = selected.reduce((sum, service) => sum + service.price.amount, 0);
  const totalDuration = selected.reduce((sum, service) => sum + service.durationMinutes, 0);

  if (status === 'success') {
    return (
      <div>
        <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
          Solicitação enviada!
        </h2>
        <p data-testid="booking-success">Solicitação enviada! Aguarde a confirmação por email.</p>
        <a
          href={`/${slug}`}
          className="mt-6 inline-block border px-6 py-3"
          style={{
            borderRadius: 'var(--ba-radius)',
            borderColor: 'var(--ba-secondary)',
            color: 'var(--ba-text)',
          }}
        >
          Voltar para o site
        </a>
      </div>
    );
  }

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        Confirme seu agendamento
      </h2>

      <ul className="mb-4 flex flex-col gap-1">
        {selected.map((service) => (
          <li
            key={service.id}
            className="flex justify-between text-sm"
            style={{ color: 'var(--ba-text)' }}
          >
            <span>{service.name}</span>
            <span>{service.price.formatted}</span>
          </li>
        ))}
      </ul>

      <p className="mb-2 font-semibold" style={{ color: 'var(--ba-text)' }}>
        Total: {formatBRL(totalAmount)} — {formatDuration(totalDuration)}
      </p>

      <p style={{ color: 'var(--ba-text)' }}>
        {formatDateLongBR(selectedDate)} às {formatTimeBR(selectedSlot.startsAt)}
      </p>

      {status === 'error' && errorMessage && (
        <div className="mt-4" data-testid="confirmation-error">
          <ErrorAlert>{errorMessage}</ErrorAlert>
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={status === 'submitting'}
          className="border px-6 py-3 disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            borderRadius: 'var(--ba-radius)',
            borderColor: 'var(--ba-secondary)',
            color: 'var(--ba-text)',
          }}
        >
          Voltar
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={status === 'submitting'}
          data-testid="step-confirm"
          style={btnStyle}
          className="border-2 px-8 py-3 font-semibold transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {status === 'submitting' ? 'Enviando...' : 'Confirmar agendamento'}
        </button>
      </div>
    </div>
  );
}
