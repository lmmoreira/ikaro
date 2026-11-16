// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LockedModulePanelsProvider, useLockedModulePanel } from './locked-module-panels-context';

function Probe({
  type,
}: {
  readonly type: 'LEAD_FORM' | 'CHATBOT' | undefined;
}): React.JSX.Element {
  const panel = useLockedModulePanel(type);
  return <div data-testid="probe">{panel ?? 'none'}</div>;
}

describe('locked module panels context', () => {
  it('returns the locked node of the module type that has one', () => {
    render(
      <LockedModulePanelsProvider value={{ LEAD_FORM: 'locked lead form' }}>
        <Probe type="LEAD_FORM" />
      </LockedModulePanelsProvider>,
    );

    expect(screen.getByTestId('probe')).toHaveTextContent('locked lead form');
  });

  it('returns nothing for a module type that is not locked', () => {
    render(
      <LockedModulePanelsProvider value={{ LEAD_FORM: 'locked lead form' }}>
        <Probe type="CHATBOT" />
      </LockedModulePanelsProvider>,
    );

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('returns nothing without a provider, an empty value or a module type', () => {
    render(<Probe type="LEAD_FORM" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('none');

    render(
      <LockedModulePanelsProvider value={undefined}>
        <Probe type={undefined} />
      </LockedModulePanelsProvider>,
    );
    expect(screen.getAllByTestId('probe')[1]).toHaveTextContent('none');
  });
});
