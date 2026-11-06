// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { IntakeVersionModal } from './IntakeVersionModal';

const VERSION: ServiceIntakeSchemaVersion = {
  id: 'schema-1',
  version: 1,
  questions: [
    { fieldKey: 'accessNeeds', label: 'Necessidades de acesso', type: 'FREE_TEXT', required: true },
  ],
  consentText: 'Concordo com os termos',
  consentVersion: 1,
  requiresNamedAttendees: false,
  participantCountRequired: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('IntakeVersionModal', () => {
  it('renders the version questions and consent text read-only', () => {
    renderWithIntl(<IntakeVersionModal version={VERSION} onClose={vi.fn()} />);

    expect(screen.getByTestId('intake-version-modal')).toBeInTheDocument();
    expect(screen.getByText('Necessidades de acesso')).toBeInTheDocument();
    expect(screen.getByText('Concordo com os termos')).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(<IntakeVersionModal version={VERSION} onClose={onClose} />);

    await user.click(screen.getByTestId('intake-version-modal-backdrop'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(<IntakeVersionModal version={VERSION} onClose={onClose} />);

    await user.click(screen.getByTestId('intake-version-modal-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithIntl(<IntakeVersionModal version={VERSION} onClose={onClose} />);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is a modal dialog titled with the version and described by the consent text', () => {
    renderWithIntl(<IntakeVersionModal version={VERSION} onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBe(screen.getByTestId('intake-version-modal'));
    expect(dialog).toHaveAccessibleName(/1/);
    expect(dialog).toHaveAccessibleDescription('Concordo com os termos');
  });
});
