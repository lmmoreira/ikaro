// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { StaffBookingDetailIntake } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingIntakeCard } from './BookingIntakeCard';

const intake: StaffBookingDetailIntake = {
  schemaVersion: 2,
  answers: [
    { fieldKey: 'level', label: 'Nível de experiência', type: 'FREE_TEXT', value: 'Iniciante' },
    { fieldKey: 'injury', label: 'Tem restrição física?', type: 'BOOLEAN', value: true },
    { fieldKey: 'pregnant', label: 'Gestante?', type: 'BOOLEAN', value: false },
  ],
  consentAcceptedAt: '2026-06-10T17:02:00.000Z',
  consentVersion: 2,
};

describe('BookingIntakeCard', () => {
  it('renders nothing for a booking without an intake', () => {
    renderWithIntl(<BookingIntakeCard intake={null} audience="staff" />);

    expect(screen.queryByTestId('booking-intake-card')).not.toBeInTheDocument();
  });

  it('shows each answer by its question, yes/no for the boolean ones', () => {
    renderWithIntl(<BookingIntakeCard intake={intake} audience="staff" />);

    expect(screen.getByText('Nível de experiência')).toBeInTheDocument();
    expect(screen.getByText('Iniciante')).toBeInTheDocument();
    expect(screen.getByText('Sim')).toBeInTheDocument();
    expect(screen.getByText('Não')).toBeInTheDocument();
  });

  it('shows the staff the consent date and version, titled as the form', () => {
    renderWithIntl(<BookingIntakeCard intake={intake} audience="staff" />);

    expect(screen.getByText('Formulário de entrada')).toBeInTheDocument();
    expect(screen.getByText(/Aceito em/)).toBeInTheDocument();
    expect(screen.getByText('versão 2')).toBeInTheDocument();
  });

  it('titles it "Suas respostas" for the customer and never shows the consent version', () => {
    renderWithIntl(<BookingIntakeCard intake={intake} audience="customer" />);

    expect(screen.getByText('Suas respostas')).toBeInTheDocument();
    expect(screen.getByText(/Aceito em/)).toBeInTheDocument();
    expect(screen.queryByText('versão 2')).not.toBeInTheDocument();
  });

  it('tells the staff the consent was not collected on a staff-created booking', () => {
    renderWithIntl(
      <BookingIntakeCard
        intake={{ ...intake, consentAcceptedAt: null, consentVersion: null }}
        audience="staff"
      />,
    );

    expect(screen.getByText('Não coletado')).toBeInTheDocument();
    expect(screen.getByText('reserva da equipe')).toBeInTheDocument();
  });

  it('shows the customer no consent row at all when none was collected', () => {
    renderWithIntl(
      <BookingIntakeCard
        intake={{ schemaVersion: 2, answers: intake.answers, consentAcceptedAt: null }}
        audience="customer"
      />,
    );

    expect(screen.queryByText('Termo de responsabilidade')).not.toBeInTheDocument();
  });
});
