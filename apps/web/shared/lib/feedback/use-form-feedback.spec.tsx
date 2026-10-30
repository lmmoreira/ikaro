// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldFeedback } from '@/shared/components/ui/field-feedback';
import { ApiError } from '@/shared/lib/api/errors';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useFormFeedback } from './use-form-feedback';

const CODE = 'BOOKING_SERVICE_POLICY_DURATION_DETAILS_REQUIRED';
const catalogMessage = resolveErrorMessage(CODE, 'en');

type FormFeedback = ReturnType<typeof useFormFeedback>;

const holder: { current: FormFeedback | null } = { current: null };

function api(): FormFeedback {
  if (!holder.current) throw new Error('Harness not rendered');
  return holder.current;
}

function Harness(): React.JSX.Element {
  const hook = useFormFeedback();
  useEffect(() => {
    holder.current = hook;
  });
  return (
    <form>
      <input aria-label="first" {...hook.fieldProps('first')} />
      <div role="group" aria-label="color" {...hook.fieldProps('color')}>
        <button type="button">pick a color</button>
      </div>
      <input aria-label="second" {...hook.fieldProps('second')} />
      <FieldFeedback id={hook.fieldErrorId('first')}>{hook.fieldErrors.first}</FieldFeedback>
    </form>
  );
}

function problem(field?: string): ApiError {
  return new ApiError(422, 'invalid', { code: CODE, field });
}

describe('useFormFeedback', () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    render(<Harness />);
  });

  afterEach(() => {
    scrollIntoView.mockReset();
  });

  it('marks, scrolls to and focuses the registered input an API error names', () => {
    act(() => api().setFromApiError(problem('first'), 'en'));

    const input = screen.getByLabelText('first');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(catalogMessage);
    expect(input).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(api().feedback).toEqual({ variant: 'error', title: catalogMessage });
  });

  it('keeps only the form-level message when the named field is not registered', () => {
    act(() => api().setFromApiError(problem('nowhere'), 'en'));

    expect(api().error).toBe(catalogMessage);
    expect(api().fieldErrors).toEqual({});
    expect(screen.getByLabelText('first')).not.toHaveAttribute('aria-invalid');
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('keeps only the form-level message for an error that names no field', () => {
    act(() => api().setFromApiError(new Error('boom'), 'en'));

    expect(api().error).toBe(resolveErrorMessage(undefined, 'en'));
    expect(api().fieldErrors).toEqual({});
  });

  it('removes the error, the success and the field marks on clear()', () => {
    act(() => api().setFromApiError(problem('first'), 'en'));
    act(() => api().clear());

    expect(api().feedback).toBeNull();
    expect(screen.getByLabelText('first')).not.toHaveAttribute('aria-invalid');

    act(() => api().setSuccess('Saved'));
    expect(api().feedback).toEqual({ variant: 'success', title: 'Saved' });
    act(() => api().clear());
    expect(api().feedback).toBeNull();
  });

  it('replaces an error with a success and a success with an error', () => {
    act(() => api().setError('Failed'));
    act(() => api().setSuccess('Saved'));
    expect(api().error).toBeNull();
    expect(api().success).toBe('Saved');

    act(() => api().setError('Failed again'));
    expect(api().success).toBeNull();
    expect(api().error).toBe('Failed again');
  });

  it('focuses the first of several invalid fields in document order', () => {
    act(() => api().setFieldErrors({ second: 'b', first: 'a' }));

    expect(screen.getByLabelText('first')).toHaveFocus();
    expect(screen.getByLabelText('second')).toHaveAttribute('aria-invalid', 'true');
  });

  it('marks and focuses a composite control that forwards no ref through its wrapper', () => {
    act(() => api().setFieldErrors({ color: 'pick one' }));

    const wrapper = screen.getByRole('group', { name: 'color' });
    expect(wrapper).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'pick a color' })).toHaveFocus();
  });

  it('stops tracking a field once its element unmounts', () => {
    const { unmount } = render(<Harness />);
    unmount();

    act(() => api().setFieldErrors({ first: 'a' }));

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
