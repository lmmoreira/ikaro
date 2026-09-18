// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { IntakeParticipantsCard, IntakeConsentCard } from './IntakeParticipantsAndConsentCards';

describe('IntakeParticipantsCard', () => {
  it('reflects the current checked state of both toggles', () => {
    renderWithIntl(
      <IntakeParticipantsCard
        participantCountRequired
        requiresNamedAttendees={false}
        onChangeParticipantCountRequired={vi.fn()}
        onChangeRequiresNamedAttendees={vi.fn()}
      />,
    );

    expect(screen.getByTestId('intake-participant-count-required')).toBeChecked();
    expect(screen.getByTestId('intake-requires-named-attendees')).not.toBeChecked();
  });

  it('calls the change handlers when toggled', async () => {
    const user = userEvent.setup();
    const onChangeParticipantCountRequired = vi.fn();
    const onChangeRequiresNamedAttendees = vi.fn();
    renderWithIntl(
      <IntakeParticipantsCard
        participantCountRequired={false}
        requiresNamedAttendees={false}
        onChangeParticipantCountRequired={onChangeParticipantCountRequired}
        onChangeRequiresNamedAttendees={onChangeRequiresNamedAttendees}
      />,
    );

    await user.click(screen.getByTestId('intake-participant-count-required'));
    expect(onChangeParticipantCountRequired).toHaveBeenCalledWith(true);

    await user.click(screen.getByTestId('intake-requires-named-attendees'));
    expect(onChangeRequiresNamedAttendees).toHaveBeenCalledWith(true);
  });
});

describe('IntakeConsentCard', () => {
  it('renders the current consent text and calls onChange when edited', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<IntakeConsentCard consentText="Concordo" onChange={onChange} />);

    expect(screen.getByTestId('intake-consent-text')).toHaveValue('Concordo');
    await user.type(screen.getByTestId('intake-consent-text'), '!');
    expect(onChange).toHaveBeenCalled();
  });
});
