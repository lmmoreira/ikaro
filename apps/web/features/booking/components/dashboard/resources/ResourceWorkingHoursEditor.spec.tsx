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
    />
  );
}

describe('ResourceWorkingHoursEditor', () => {
  it('starts with the inherit toggle on and no custom day rows when value is null', () => {
    renderWithIntl(<ResourceWorkingHoursEditor value={null} onChange={vi.fn()} />);

    expect(screen.getByTestId('resource-hours-inherit-toggle')).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.queryByTestId('resource-hours-custom')).not.toBeInTheDocument();
  });

  it('switches to custom hours and calls onChange with a full week when the toggle is turned off', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(<ControlledEditor onChange={onChange} />);

    await user.click(screen.getByTestId('resource-hours-inherit-toggle'));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        monday: expect.any(Object),
        sunday: null,
      }),
    );
    expect(screen.getByTestId('resource-hours-custom')).toBeInTheDocument();
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
      />,
    );

    await user.click(screen.getByTestId('resource-hours-inherit-toggle'));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
