// @vitest-environment jsdom
import { useState } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceWorkingHours } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceWorkingHoursEditor } from './ResourceWorkingHoursEditor';

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({ timeFormat: '24h' as const }),
}));

// Every test that mounts the 7-row custom-hours section (28 Radix Selects) can exceed vitest's
// default 10s budget under a heavy full-suite parallel run, even though each finishes in a few
// seconds standalone — confirmed by running this file alone vs. inside the full ~375-file suite.
vi.setConfig({ testTimeout: 20000 });

const TENANT_BUSINESS_HOURS: ResourceWorkingHours = {
  monday: { open: '08:00', close: '17:00' },
  tuesday: { open: '08:00', close: '17:00' },
  wednesday: { open: '08:00', close: '17:00' },
  thursday: { open: '08:00', close: '17:00' },
  friday: { open: '08:00', close: '17:00' },
  saturday: null,
  sunday: null,
};

// ResourceWorkingHoursEditor is fully controlled — a static vi.fn() onChange never feeds a new
// value back in, so the toggled-open custom section never actually renders. A small stateful
// wrapper closes the loop (same pattern as SettingsFormAdvancedFields.spec.tsx's ControlledPhoneField).
function ControlledEditor({
  onChange,
}: {
  readonly onChange: (value: ResourceWorkingHours | null) => void;
}): React.JSX.Element {
  const [value, setValue] = useState<ResourceWorkingHours | null>(null);
  return (
    <ResourceWorkingHoursEditor
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      tenantBusinessHours={TENANT_BUSINESS_HOURS}
    />
  );
}

describe('ResourceWorkingHoursEditor', () => {
  it('starts with the inherit toggle on and no custom day rows when value is null', () => {
    renderWithIntl(
      <ResourceWorkingHoursEditor
        value={null}
        onChange={vi.fn()}
        tenantBusinessHours={TENANT_BUSINESS_HOURS}
      />,
    );

    expect(screen.getByTestId('resource-hours-inherit-toggle')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByTestId('resource-hours-custom')).not.toBeInTheDocument();
  });

  it("switches to custom hours and seeds it from the tenant's own business hours, not all-closed", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<ControlledEditor onChange={onChange} />);

    await user.click(screen.getByTestId('resource-hours-inherit-toggle'));

    expect(onChange).toHaveBeenCalledWith(TENANT_BUSINESS_HOURS);
    expect(screen.getByTestId('resource-hours-custom')).toBeInTheDocument();
  });

  it('falls back to a fully-closed week when the tenant business hours have not loaded yet', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <ResourceWorkingHoursEditor value={null} onChange={onChange} tenantBusinessHours={null} />,
    );

    await user.click(screen.getByTestId('resource-hours-inherit-toggle'));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ monday: null, sunday: null }));
  });

  it('switches back to inherit (null) when the toggle is turned back on', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <ResourceWorkingHoursEditor
        value={{
          monday: { open: '09:00', close: '18:00' },
          tuesday: { open: '09:00', close: '18:00' },
          wednesday: { open: '09:00', close: '18:00' },
          thursday: { open: '09:00', close: '18:00' },
          friday: { open: '09:00', close: '18:00' },
          saturday: null,
          sunday: null,
        }}
        onChange={onChange}
        tenantBusinessHours={TENANT_BUSINESS_HOURS}
      />,
    );

    await user.click(screen.getByTestId('resource-hours-inherit-toggle'));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('renders a locked, non-interactive summary instead of the toggle when locked (LOCATION resources)', () => {
    renderWithIntl(
      <ResourceWorkingHoursEditor
        value={null}
        onChange={vi.fn()}
        tenantBusinessHours={TENANT_BUSINESS_HOURS}
        locked
      />,
    );

    expect(screen.getByTestId('resource-hours-locked')).toBeInTheDocument();
    expect(screen.queryByTestId('resource-hours-inherit-toggle')).not.toBeInTheDocument();
    expect(screen.queryByTestId('resource-hours-custom')).not.toBeInTheDocument();
  });
});
