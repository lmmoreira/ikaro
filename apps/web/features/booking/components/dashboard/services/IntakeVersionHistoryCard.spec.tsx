// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { IntakeVersionHistoryCard } from './IntakeVersionHistoryCard';

const V1: ServiceIntakeSchemaVersion = {
  id: 'schema-1',
  version: 1,
  questions: [],
  consentText: 'Concordo v1',
  consentVersion: 1,
  requiresNamedAttendees: false,
  participantCountRequired: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('IntakeVersionHistoryCard', () => {
  it('renders nothing when there is no active version and no history', () => {
    const { container } = renderWithIntl(
      <IntakeVersionHistoryCard active={null} history={[]} onSelectVersion={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the active version badge', () => {
    renderWithIntl(<IntakeVersionHistoryCard active={V1} history={[]} onSelectVersion={vi.fn()} />);

    expect(screen.getByTestId('intake-version-current')).toHaveTextContent('1');
  });

  it('calls onSelectVersion when a history row is clicked', async () => {
    const user = userEvent.setup();
    const onSelectVersion = vi.fn();
    const v2 = { ...V1, id: 'schema-2', version: 2 };
    renderWithIntl(
      <IntakeVersionHistoryCard active={v2} history={[V1]} onSelectVersion={onSelectVersion} />,
    );

    await user.click(screen.getByTestId('intake-version-history-row'));
    expect(onSelectVersion).toHaveBeenCalledWith(V1);
  });
});
