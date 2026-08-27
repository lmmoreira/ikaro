// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnstileWidget } from './TurnstileWidget';

vi.mock('next/script', () => ({
  default: ({ onLoad }: { onLoad?: () => void }) => {
    onLoad?.();
    return null;
  },
}));

describe('TurnstileWidget', () => {
  const renderMock = vi.fn().mockReturnValue('widget-1');
  const removeMock = vi.fn();

  beforeEach(() => {
    renderMock.mockClear();
    removeMock.mockClear();
    window.turnstile = { render: renderMock, remove: removeMock };
  });

  afterEach(() => {
    delete window.turnstile;
  });

  it('renders the widget container and calls turnstile.render() with the site key once the script loads', () => {
    const onVerify = vi.fn();
    const onExpire = vi.fn();
    const onError = vi.fn();

    render(
      <TurnstileWidget
        siteKey="1x00000000000000000000AA"
        onVerify={onVerify}
        onExpire={onExpire}
        onError={onError}
      />,
    );

    expect(screen.getByTestId('turnstile-widget')).toBeInTheDocument();
    expect(renderMock).toHaveBeenCalledTimes(1);
    const [container, options] = renderMock.mock.calls[0] as [HTMLElement, Record<string, unknown>];
    expect(container).toBeInstanceOf(HTMLElement);
    expect(options['sitekey']).toBe('1x00000000000000000000AA');
  });

  it('always invokes the latest onVerify/onExpire/onError props, even though the options passed to render() are stable wrapper functions', () => {
    const onVerify = vi.fn();
    const onExpire = vi.fn();
    const onError = vi.fn();

    render(
      <TurnstileWidget
        siteKey="1x00000000000000000000AA"
        onVerify={onVerify}
        onExpire={onExpire}
        onError={onError}
      />,
    );

    const options = renderMock.mock.calls[0]?.[1] as {
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    };
    options.callback('tok-1');
    options['expired-callback']();
    options['error-callback']();

    expect(onVerify).toHaveBeenCalledWith('tok-1');
    expect(onExpire).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });

  // The direct fix for PR #433 review's finding: LeadFormFields.tsx passes new inline arrow
  // functions for onExpire/onError on every parent re-render (e.g. every keystroke). Before this
  // fix, renderWidget()'s useCallback depended on those props directly, so its identity changed
  // every re-render, re-running the effect and removing+recreating the real widget — including
  // mid-verification. This is what caused the Turnstile iframe to never settle into a visible
  // state in real-browser E2E runs.
  it('does not remove/recreate the widget when the parent re-renders with new callback identities', () => {
    const { rerender } = render(
      <TurnstileWidget
        siteKey="1x00000000000000000000AA"
        onVerify={() => {}}
        onExpire={() => {}}
        onError={() => {}}
      />,
    );
    expect(renderMock).toHaveBeenCalledTimes(1);

    rerender(
      <TurnstileWidget
        siteKey="1x00000000000000000000AA"
        onVerify={() => {}}
        onExpire={() => {}}
        onError={() => {}}
      />,
    );

    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('removes and recreates the widget when siteKey actually changes', () => {
    const { rerender } = render(
      <TurnstileWidget
        siteKey="1x00000000000000000000AA"
        onVerify={vi.fn()}
        onExpire={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(renderMock).toHaveBeenCalledTimes(1);

    rerender(
      <TurnstileWidget
        siteKey="different-site-key"
        onVerify={vi.fn()}
        onExpire={vi.fn()}
        onError={vi.fn()}
      />,
    );

    expect(removeMock).toHaveBeenCalledWith('widget-1');
    expect(renderMock).toHaveBeenCalledTimes(2);
  });

  it('removes the widget on unmount', () => {
    const { unmount } = render(
      <TurnstileWidget
        siteKey="1x00000000000000000000AA"
        onVerify={vi.fn()}
        onExpire={vi.fn()}
        onError={vi.fn()}
      />,
    );

    unmount();

    expect(removeMock).toHaveBeenCalledWith('widget-1');
  });
});
