'use client';

import { useState } from 'react';
import type React from 'react';
import { z } from 'zod';
import type { AvailableSlot, HotsiteServiceResponse } from '@beloauto/types';
import type { PersonalInfoValue } from '@/lib/booking/personal-info';
import { formatPhoneBR } from '@/lib/utils';
import { AddressFields } from './AddressFields';
import { BookingSummaryCard } from './BookingSummaryCard';
import { PhotoUpload } from './PhotoUpload';

interface PersonalInfoStepProps {
  readonly slug: string;
  readonly value: PersonalInfoValue;
  readonly onChange: (value: PersonalInfoValue) => void;
  readonly services: readonly HotsiteServiceResponse[];
  readonly selectedServiceIds: readonly string[];
  readonly selectedDate: string;
  readonly selectedSlot: AvailableSlot;
  readonly onNext: () => void;
  readonly onBack: () => void;
}

const inputStyle = { borderRadius: 'var(--ba-radius)', borderColor: 'var(--ba-secondary)' };

const EMAIL_SCHEMA = z.email();

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

function validate(value: PersonalInfoValue): string | null {
  if (!value.contactName.trim()) return 'Informe seu nome.';
  if (!EMAIL_SCHEMA.safeParse(value.contactEmail).success) return 'Informe um e-mail válido.';
  if (!value.contactPhone.trim()) return 'Informe seu telefone.';
  return null;
}

export function PersonalInfoStep({
  slug,
  value,
  onChange,
  services,
  selectedServiceIds,
  selectedDate,
  selectedSlot,
  onNext,
  onBack,
}: PersonalInfoStepProps) {
  const [showContactAddress, setShowContactAddress] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNext() {
    const validationError = validate(value);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onNext();
  }

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold" style={{ color: 'var(--ba-text)' }}>
        Seus dados
      </h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label
            htmlFor="contact-name"
            className="mb-1 block text-sm font-medium"
            style={{ color: 'var(--ba-text)' }}
          >
            Nome
          </label>
          <input
            id="contact-name"
            type="text"
            required
            value={value.contactName}
            onChange={(e) => onChange({ ...value, contactName: e.target.value })}
            className="w-full border px-3 py-2"
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="contact-email"
            className="mb-1 block text-sm font-medium"
            style={{ color: 'var(--ba-text)' }}
          >
            E-mail
          </label>
          <input
            id="contact-email"
            type="email"
            required
            value={value.contactEmail}
            onChange={(e) => onChange({ ...value, contactEmail: e.target.value })}
            className="w-full border px-3 py-2"
            style={inputStyle}
          />
        </div>

        <div>
          <label
            htmlFor="contact-phone"
            className="mb-1 block text-sm font-medium"
            style={{ color: 'var(--ba-text)' }}
          >
            Telefone
          </label>
          <div className="flex">
            <span
              className="flex items-center border border-r-0 bg-gray-50 px-3 text-sm font-medium"
              style={{
                borderRadius: 'var(--ba-radius) 0 0 var(--ba-radius)',
                borderColor: 'var(--ba-secondary)',
                color: 'var(--ba-text)',
              }}
            >
              +55
            </span>
            <input
              id="contact-phone"
              type="tel"
              inputMode="numeric"
              required
              maxLength={15}
              placeholder="(11) 91234-5678"
              value={formatPhoneBR(value.contactPhone)}
              onChange={(e) => onChange({ ...value, contactPhone: formatPhoneBR(e.target.value) })}
              className="min-w-0 flex-1 border px-3 py-2"
              style={{
                borderRadius: '0 var(--ba-radius) var(--ba-radius) 0',
                borderColor: 'var(--ba-secondary)',
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button
          type="button"
          onClick={() => setShowContactAddress((prev) => !prev)}
          className="text-sm font-medium underline"
          style={{ color: 'var(--ba-primary)' }}
          aria-expanded={showContactAddress}
        >
          Endereço de contato (opcional)
        </button>
        {showContactAddress && (
          <div className="mt-3">
            <AddressFields
              value={value.contactAddress}
              onChange={(address) => onChange({ ...value, contactAddress: address })}
              idPrefix="contact-address"
              required={false}
            />
          </div>
        )}
      </div>

      <BookingSummaryCard
        services={services}
        selectedServiceIds={selectedServiceIds}
        selectedDate={selectedDate}
        selectedSlot={selectedSlot}
      />

      <div className="mt-6">
        <PhotoUpload
          slug={slug}
          value={value.photoFilePaths}
          onChange={(photoFilePaths) => onChange({ ...value, photoFilePaths })}
        />
      </div>

      {error && (
        <p className="mt-4" data-testid="personal-info-error" style={{ color: 'var(--ba-text)' }}>
          {error}
        </p>
      )}

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="border px-6 py-3"
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
          onClick={handleNext}
          style={btnStyle}
          className="border-2 px-8 py-3 font-semibold transition-all hover:opacity-90"
        >
          Próximo
        </button>
      </div>
    </div>
  );
}
