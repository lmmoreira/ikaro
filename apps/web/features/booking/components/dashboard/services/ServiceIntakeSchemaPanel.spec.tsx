// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { useState } from 'react';
import type { ServiceTabAction } from './service-tab-action';
import { renderWithIntl } from '@/test-utils';
import { ServiceIntakeSchemaPanel } from './ServiceIntakeSchemaPanel';

// The panel no longer draws its own Save/Publish button — it registers the action with
// ServiceEditPage's sticky action panel. This harness plays that role so the panel's own
// behavior (validation, in-flight state, dirty tracking) stays testable in isolation.
function IntakePanelWithAction(
  props: Omit<Parameters<typeof ServiceIntakeSchemaPanel>[0], 'onActionChange'>,
) {
  const [action, setAction] = useState<ServiceTabAction | null>(null);
  return (
    <>
      <ServiceIntakeSchemaPanel {...props} onActionChange={setAction} />
      <button
        type="button"
        data-testid="intake-publish"
        disabled={action === null || action.disabled || action.pending}
        onClick={action?.onSubmit}
      >
        {action?.label}
      </button>
    </>
  );
}

const mutateAsync = vi.fn();

vi.mock('@/features/booking/services/useServices', () => ({
  usePublishServiceIntakeSchema: () => ({ mutateAsync, isPending: false }),
}));

const V1: ServiceIntakeSchemaVersion = {
  id: 'schema-1',
  version: 1,
  questions: [
    {
      fieldKey: 'accessNeeds',
      label: 'Necessidades de acesso',
      type: 'FREE_TEXT',
      required: false,
    },
  ],
  consentText: 'Concordo v1',
  consentVersion: 1,
  requiresNamedAttendees: false,
  participantCountRequired: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => mutateAsync.mockReset());

// data-testid stays static per repeated row (E2E-3) — disambiguated by data-question-index /
// data-version instead.
function getByIndex(container: HTMLElement, testId: string, index: number): HTMLElement {
  const el = container.querySelector(`[data-testid="${testId}"][data-question-index="${index}"]`);
  if (!el) throw new Error(`No element found for testId=${testId} index=${index}`);
  return el as HTMLElement;
}

function getByVersion(container: HTMLElement, version: number): HTMLElement {
  const el = container.querySelector(
    `[data-testid="intake-version-history-row"][data-version="${version}"]`,
  );
  if (!el) throw new Error(`No history row found for version=${version}`);
  return el as HTMLElement;
}

describe('ServiceIntakeSchemaPanel', () => {
  it('shows the empty-question hint when there are no questions yet', () => {
    renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={null}
        initialHistory={[]}
        onDirtyChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('intake-questions-empty')).toBeInTheDocument();
    expect(screen.getByTestId('intake-publish')).toBeDisabled();
  });

  it('adds, edits, reorders and removes questions on the live list', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={null}
        initialHistory={[]}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('intake-add-question'));
    await user.click(screen.getByTestId('intake-add-question'));
    expect(getByIndex(container, 'intake-question', 0)).toBeInTheDocument();
    expect(getByIndex(container, 'intake-question', 1)).toBeInTheDocument();

    await user.type(getByIndex(container, 'intake-question-label', 0), 'Necessidades de acesso');
    expect(getByIndex(container, 'intake-question-fieldkey', 0)).toHaveTextContent(
      'necessidadesDeAcesso',
    );

    await user.click(getByIndex(container, 'intake-question-down', 0));
    expect(getByIndex(container, 'intake-question-label', 1)).toHaveValue('Necessidades de acesso');

    await user.click(getByIndex(container, 'intake-question-remove', 1));
    expect(
      container.querySelector('[data-testid="intake-question"][data-question-index="1"]'),
    ).not.toBeInTheDocument();
  });

  it('pre-fills from the active version and shows it in history', () => {
    const { container } = renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={V1}
        initialHistory={[]}
        onDirtyChange={vi.fn()}
      />,
    );

    expect(getByIndex(container, 'intake-question-label', 0)).toHaveValue('Necessidades de acesso');
    expect(screen.getByTestId('intake-consent-text')).toHaveValue('Concordo v1');
    expect(screen.getByTestId('intake-version-current')).toHaveTextContent('1');
  });

  it('opens a read-only preview modal for a non-active version on click', async () => {
    const user = userEvent.setup();
    const v2 = { ...V1, id: 'schema-2', version: 2, consentText: 'Concordo v2' };
    const { container } = renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={v2}
        initialHistory={[V1]}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(getByVersion(container, 1));
    expect(screen.getByTestId('intake-version-modal')).toBeInTheDocument();
    expect(screen.getByText('Concordo v1')).toBeInTheDocument();
  });

  it('closes the version modal on the native dialog cancel event (Escape, real browser)', async () => {
    const user = userEvent.setup();
    const v2 = { ...V1, id: 'schema-2', version: 2, consentText: 'Concordo v2' };
    const { container } = renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={v2}
        initialHistory={[V1]}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(getByVersion(container, 1));
    // jsdom doesn't implement <dialog>'s native Escape-to-cancel behavior (only showModal()/
    // close() are polyfilled in vitest.setup.ts) — dispatch the 'cancel' event directly.
    fireEvent(
      screen.getByTestId('intake-version-modal'),
      new Event('cancel', { cancelable: true }),
    );
    expect(screen.queryByTestId('intake-version-modal')).not.toBeInTheDocument();
  });

  it('publishes and moves the previous active version into history', async () => {
    const user = userEvent.setup();
    mutateAsync.mockResolvedValue({ ...V1, id: 'schema-2', version: 2, consentText: 'v2' });
    const { container } = renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={V1}
        initialHistory={[]}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.clear(screen.getByTestId('intake-consent-text'));
    await user.type(screen.getByTestId('intake-consent-text'), 'v2');
    await user.click(screen.getByTestId('intake-publish'));

    expect(mutateAsync).toHaveBeenCalledWith({
      id: 'svc-1',
      body: expect.objectContaining({ consentText: 'v2' }),
    });
    expect(await screen.findByTestId('intake-published')).toBeInTheDocument();
    expect(getByVersion(container, 1)).toBeInTheDocument();
    expect(screen.getByTestId('intake-version-current')).toHaveTextContent('2');
  });

  it('keeps at most the 5 most recent previous versions in history after publishing', async () => {
    const user = userEvent.setup();
    const version = (n: number): ServiceIntakeSchemaVersion => ({
      ...V1,
      id: `schema-${n}`,
      version: n,
    });
    mutateAsync.mockResolvedValue(version(7));
    const { container } = renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={version(6)}
        initialHistory={[version(5), version(4), version(3), version(2), version(1)]}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.clear(screen.getByTestId('intake-consent-text'));
    await user.type(screen.getByTestId('intake-consent-text'), 'v7');
    await user.click(screen.getByTestId('intake-publish'));

    expect(await screen.findByTestId('intake-published')).toBeInTheDocument();
    expect(getByVersion(container, 6)).toBeInTheDocument();
    expect(getByVersion(container, 2)).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="intake-version-history-row"][data-version="1"]'),
    ).toBeNull();
    expect(container.querySelectorAll('[data-testid="intake-version-history-row"]')).toHaveLength(
      5,
    );
  });

  it('keeps dirty when a newer draft edit lands while an earlier publish is still pending', async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    let resolvePublish: (value: ServiceIntakeSchemaVersion) => void = () => {};
    mutateAsync.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePublish = resolve;
      }),
    );
    renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={V1}
        initialHistory={[]}
        onDirtyChange={onDirtyChange}
      />,
    );

    await user.type(screen.getByTestId('intake-consent-text'), '!');
    await user.click(screen.getByTestId('intake-publish'));

    // A second edit lands while the first publish is still in flight.
    await user.type(screen.getByTestId('intake-consent-text'), '!');

    resolvePublish({ ...V1, id: 'schema-2', version: 2 });
    await screen.findByTestId('intake-publish');

    expect(onDirtyChange).not.toHaveBeenLastCalledWith(false);
    expect(screen.queryByTestId('intake-published')).not.toBeInTheDocument();
  });

  it('surfaces a publish error inline (e.g. a duplicate-fieldKey 422)', async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValueOnce(new Error('422'));
    renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={V1}
        initialHistory={[]}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('intake-publish'));
    expect(await screen.findByTestId('intake-error')).toBeInTheDocument();
  });

  it('blocks publish and shows an inline warning when two questions resolve to the same fieldKey', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={null}
        initialHistory={[]}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('intake-add-question'));
    await user.click(screen.getByTestId('intake-add-question'));
    await user.type(getByIndex(container, 'intake-question-label', 0), 'Necessidades');
    await user.type(getByIndex(container, 'intake-question-label', 1), 'Necessidades');
    await user.type(screen.getByTestId('intake-consent-text'), 'Concordo');

    expect(screen.getByTestId('intake-duplicate-fieldkey-error')).toBeInTheDocument();
    expect(screen.getByTestId('intake-publish')).toBeDisabled();
  });

  it('caps the derived fieldKey at 100 characters (matches the shared schema max)', async () => {
    const user = userEvent.setup();
    const { container } = renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={null}
        initialHistory={[]}
        onDirtyChange={vi.fn()}
      />,
    );

    await user.click(screen.getByTestId('intake-add-question'));
    const longNoSpaceLabel = 'a'.repeat(150);
    await user.type(getByIndex(container, 'intake-question-label', 0), longNoSpaceLabel);

    const fieldKeyText = getByIndex(container, 'intake-question-fieldkey', 0).textContent ?? '';
    expect(fieldKeyText).toContain('a'.repeat(100));
    expect(fieldKeyText).not.toContain('a'.repeat(101));
  });

  it('enforces the 1-50 question limit by disabling "add question" at 50', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <IntakePanelWithAction
        serviceId="svc-1"
        initialActive={null}
        initialHistory={[]}
        onDirtyChange={vi.fn()}
      />,
    );

    for (let i = 0; i < 50; i += 1) {
      await user.click(screen.getByTestId('intake-add-question'));
    }

    expect(screen.getByTestId('intake-add-question')).toBeDisabled();
  });
});
