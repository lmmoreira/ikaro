// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
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

  it('calls onClose when the native dialog cancel event fires (Escape, real browser)', () => {
    const onClose = vi.fn();
    renderWithIntl(<IntakeVersionModal version={VERSION} onClose={onClose} />);

    // jsdom doesn't implement <dialog>'s native Escape-to-cancel behavior (only showModal()/
    // close() are polyfilled in vitest.setup.ts) — dispatch the 'cancel' event directly to verify
    // this component's own onCancel wiring, matching every other native-<dialog>-based modal in
    // this codebase (none of which unit-test the browser's own Escape handling either).
    fireEvent(
      screen.getByTestId('intake-version-modal'),
      new Event('cancel', { cancelable: true }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
