// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { emptyIntakeAnswers } from '@/features/booking/model/intake-answers';
import { renderWithIntl } from '@/test-utils';
import { NewBookingIntakeStep } from './NewBookingIntakeStep';

const SCHEMA: ServiceIntakeSchemaVersion = {
  id: 'schema-1',
  version: 2,
  questions: [
    { fieldKey: 'goal', label: 'Objetivo', type: 'FREE_TEXT', required: true },
    { fieldKey: 'firstTime', label: 'Primeira vez', type: 'BOOLEAN', required: false },
    { fieldKey: 'equipment', label: 'Tem equipamento', type: 'BOOLEAN', required: true },
  ],
  consentText: 'Aceito os termos',
  consentVersion: 1,
  requiresNamedAttendees: true,
  participantCountRequired: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function renderStep(overrides: Partial<React.ComponentProps<typeof NewBookingIntakeStep>> = {}) {
  const props = {
    schema: SCHEMA,
    value: emptyIntakeAnswers(),
    onChange: vi.fn(),
    serverError: null,
    summary: null,
    onBack: vi.fn(),
    onNext: vi.fn(),
    ...overrides,
  };
  renderWithIntl(<NewBookingIntakeStep {...props} />);
  return props;
}

describe('NewBookingIntakeStep', () => {
  it('lets staff continue with nothing answered, nothing marked required', async () => {
    const props = renderStep();

    await userEvent.click(screen.getAllByTestId('step-next')[0]!);

    expect(props.onNext).toHaveBeenCalledOnce();
    expect(screen.queryByTestId('intake-error-summary')).not.toBeInTheDocument();
    expect(screen.queryByText('*')).not.toBeInTheDocument();
  });

  it('renders every question the schema defines, by type', () => {
    renderStep();

    expect(screen.getByTestId('intake-input')).toBeInTheDocument();
    expect(screen.getByTestId('intake-bool-checkbox')).toBeInTheDocument();
    expect(screen.getAllByTestId('intake-bool-option')).toHaveLength(2);
    expect(screen.getByTestId('intake-participants')).toBeInTheDocument();
    expect(screen.getByTestId('intake-attendees')).toBeInTheDocument();
  });

  it('reports a typed answer under its question key', () => {
    const props = renderStep();

    fireEvent.change(screen.getByTestId('intake-input'), { target: { value: 'Perder peso' } });

    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ answers: { goal: 'Perder peso' } }),
    );
  });

  it('reports a yes/no answer, including an explicit no', async () => {
    const props = renderStep();

    await userEvent.click(screen.getAllByTestId('intake-bool-option')[1]!);

    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ answers: { equipment: false } }),
    );
  });

  it('leaves the consent as a tick staff may skip', async () => {
    const props = renderStep();

    await userEvent.click(screen.getByTestId('intake-consent'));

    expect(props.onChange).toHaveBeenCalledWith(expect.objectContaining({ consentAccepted: true }));
    expect(screen.getByText('Aceito os termos')).toBeInTheDocument();
  });

  it('adds, edits and removes attendees', async () => {
    const props = renderStep();

    await userEvent.click(screen.getByTestId('intake-add-attendee'));

    const added = vi.mocked(props.onChange).mock.calls[0]![0] as { attendees: { name: string }[] };
    expect(added.attendees).toHaveLength(1);
  });

  it('shows a server refusal sent back to this step', () => {
    renderStep({ serverError: 'Resposta inválida' });

    expect(screen.getByRole('alert')).toHaveTextContent('Resposta inválida');
  });
});
