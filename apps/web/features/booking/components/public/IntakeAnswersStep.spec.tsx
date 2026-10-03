// @vitest-environment jsdom
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { intakeFieldError, renderWithIntl } from '@/test-utils';
import {
  emptyIntakeAnswers,
  type IntakeAnswersValue,
} from '@/features/booking/model/intake-answers';
import { IntakeAnswersStep } from './IntakeAnswersStep';

const schema: ServiceIntakeSchemaVersion = {
  id: 'schema-1',
  version: 2,
  questions: [
    { fieldKey: 'goal', label: 'Qual o objetivo da reserva?', type: 'FREE_TEXT', required: true },
    { fieldKey: 'first', label: 'É a primeira vez?', type: 'BOOLEAN', required: false },
    { fieldKey: 'equipment', label: 'Precisa de equipamento?', type: 'BOOLEAN', required: true },
  ],
  consentText: 'Li e aceito os termos.',
  consentVersion: 1,
  requiresNamedAttendees: true,
  participantCountRequired: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function Harness({
  onNext,
  onValue,
  serverError = null,
  schemaOverride = schema,
}: {
  readonly onNext: () => void;
  readonly onValue?: (value: IntakeAnswersValue) => void;
  readonly serverError?: string | null;
  readonly schemaOverride?: ServiceIntakeSchemaVersion;
}) {
  const [value, setValue] = useState(emptyIntakeAnswers());
  return (
    <IntakeAnswersStep
      schema={schemaOverride}
      value={value}
      onChange={(next) => {
        setValue(next);
        onValue?.(next);
      }}
      serverError={serverError}
      onNext={onNext}
      onBack={vi.fn()}
    />
  );
}

async function fillValid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Qual o objetivo/), 'Treino');
  await user.click(screen.getByRole('radio', { name: 'Não' }));
  await user.type(screen.getByLabelText(/Quantidade de participantes/), '2');
  await user.click(screen.getByTestId('intake-consent'));
}

describe('IntakeAnswersStep', () => {
  it('renders one control per question, the participant count, attendees and the consent text', () => {
    renderWithIntl(<Harness onNext={vi.fn()} />);

    expect(screen.getByLabelText(/Qual o objetivo/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'É a primeira vez?' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sim' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Não' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Quantidade de participantes/)).toBeInTheDocument();
    expect(screen.getByTestId('intake-attendees')).toBeInTheDocument();
    expect(screen.getByText('Li e aceito os termos.')).toBeInTheDocument();
    expect(screen.getByText(/versão atual do formulário \(v2\)/)).toBeInTheDocument();
  });

  it('omits the participant count and the attendees when the schema does not ask for them', () => {
    renderWithIntl(
      <Harness
        onNext={vi.fn()}
        schemaOverride={{
          ...schema,
          participantCountRequired: false,
          requiresNamedAttendees: false,
        }}
      />,
    );

    expect(screen.queryByLabelText(/Quantidade de participantes/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('intake-attendees')).not.toBeInTheDocument();
  });

  it('shows no error before the first attempt', () => {
    renderWithIntl(<Harness onNext={vi.fn()} />);

    expect(screen.queryByTestId('intake-error-summary')).not.toBeInTheDocument();
  });

  it('shows field errors and the focused summary for every missing item on Próximo', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderWithIntl(<Harness onNext={onNext} />);

    await user.click(screen.getByTestId('step-next'));

    expect(onNext).not.toHaveBeenCalled();
    expect(intakeFieldError('goal')).toHaveTextContent('Este campo é obrigatório.');
    expect(intakeFieldError('equipment')).toBeInTheDocument();
    expect(screen.getByTestId('intake-field-error-participants')).toHaveTextContent(
      'Informe a quantidade de participantes.',
    );
    expect(screen.getByTestId('intake-consent-error')).toHaveTextContent(
      'Você precisa aceitar os termos para continuar.',
    );
    const summary = screen.getByTestId('intake-error-summary');
    expect(summary).toHaveTextContent('4 campos precisam de atenção');
    expect(summary).toHaveFocus();
  });

  it('treats whitespace-only text as missing', async () => {
    const user = userEvent.setup();
    renderWithIntl(<Harness onNext={vi.fn()} />);

    await user.type(screen.getByLabelText(/Qual o objetivo/), '   ');
    await user.click(screen.getByTestId('step-next'));

    expect(intakeFieldError('goal')).toBeInTheDocument();
  });

  it('accepts "Não" as the answer to a required yes/no and continues', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    renderWithIntl(<Harness onNext={onNext} />);

    await fillValid(user);
    await user.click(screen.getByTestId('step-next'));

    expect(onNext).toHaveBeenCalled();
    expect(screen.queryByTestId('intake-error-summary')).not.toBeInTheDocument();
  });

  it('clears an error as soon as the item is fixed', async () => {
    const user = userEvent.setup();
    renderWithIntl(<Harness onNext={vi.fn()} />);
    await user.click(screen.getByTestId('step-next'));

    await user.type(screen.getByLabelText(/Qual o objetivo/), 'Treino');

    expect(intakeFieldError('goal')).not.toBeInTheDocument();
    expect(screen.getByTestId('intake-error-summary')).toHaveTextContent('3 campos precisam');
  });

  it('rejects a participant count of zero', async () => {
    const user = userEvent.setup();
    renderWithIntl(<Harness onNext={vi.fn()} />);

    await user.type(screen.getByLabelText(/Quantidade de participantes/), '0');
    await user.click(screen.getByTestId('step-next'));

    expect(screen.getByTestId('intake-field-error-participants')).toBeInTheDocument();
  });

  it('shows only the summary banner with the catalogue text for a server-side rejection', () => {
    renderWithIntl(
      <Harness
        onNext={vi.fn()}
        serverError="É necessário responder às perguntas obrigatórias e aceitar os termos."
      />,
    );

    expect(screen.getByTestId('intake-error-summary')).toHaveTextContent(
      'É necessário responder às perguntas obrigatórias e aceitar os termos.',
    );
    expect(intakeFieldError('goal')).not.toBeInTheDocument();
    expect(screen.getByTestId('intake-error-summary')).toHaveFocus();
  });

  it('keeps every answer in the controlled value', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    renderWithIntl(<Harness onNext={vi.fn()} onValue={onValue} />);

    await user.type(screen.getByLabelText(/Qual o objetivo/), 'ab');

    expect(onValue).toHaveBeenLastCalledWith(expect.objectContaining({ answers: { goal: 'ab' } }));
  });

  it('marks the consent as required and links it to its error once it fails', async () => {
    const user = userEvent.setup();
    renderWithIntl(<Harness onNext={vi.fn()} />);
    const consent = screen.getByTestId('intake-consent');
    expect(consent).toBeRequired();
    expect(consent).not.toHaveAttribute('aria-invalid');

    await user.click(screen.getByTestId('step-next'));

    expect(consent).toHaveAttribute('aria-invalid', 'true');
    expect(consent).toHaveAttribute('aria-describedby', 'intake-consent-error');
    expect(screen.getByTestId('intake-consent-error')).toHaveAttribute(
      'id',
      'intake-consent-error',
    );
  });
});
