// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnstileWidget } from './TurnstileWidget';

// autoLoad toggles whether the mocked <Script> fires onLoad synchronously — true for every
// existing test (script loads normally), false for the load-timeout tests below, which need
// onLoad to never fire so the 10s timer in TurnstileWidget actually elapses.
const { mockScriptState } = vi.hoisted(() => ({ mockScriptState: { autoLoad: true } }));

vi.mock('next/script', () => ({
  default: ({ onLoad }: { onLoad?: () => void }) => {
    if (mockScriptState.autoLoad) onLoad?.();
    return null;
  },
}));

describe('TurnstileWidget', () => {
  const renderMock = vi.fn().mockReturnValue('widget-1');
  const removeMock = vi.fn();

  beforeEach(() => {
    renderMock.mockClear();
    removeMock.mockClear();
    mockScriptState.autoLoad = true;
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
        onLoadTimeout={vi.fn()}
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
        onLoadTimeout={vi.fn()}
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
        onLoadTimeout={() => {}}
      />,
    );
    expect(renderMock).toHaveBeenCalledTimes(1);

    rerender(
      <TurnstileWidget
        siteKey="1x00000000000000000000AA"
        onVerify={() => {}}
        onExpire={() => {}}
        onError={() => {}}
        onLoadTimeout={() => {}}
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
        onLoadTimeout={vi.fn()}
      />,
    );
    expect(renderMock).toHaveBeenCalledTimes(1);

    rerender(
      <TurnstileWidget
        siteKey="different-site-key"
        onVerify={vi.fn()}
        onExpire={vi.fn()}
        onError={vi.fn()}
        onLoadTimeout={vi.fn()}
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
        onLoadTimeout={vi.fn()}
      />,
    );

    unmount();

    expect(removeMock).toHaveBeenCalledWith('widget-1');
  });

  // M20-S15: previously, a script that never loaded (CSP block, ad-blocker, edge issue, network
  // flake) hung the widget silently forever — no user-facing signal. This is the direct
  // regression test for that gap.
  describe('load-timeout fallback', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('calls onLoadTimeout once the script has not loaded within 10s', () => {
      mockScriptState.autoLoad = false;
      const onLoadTimeout = vi.fn();

      render(
        <TurnstileWidget
          siteKey="1x00000000000000000000AA"
          onVerify={vi.fn()}
          onExpire={vi.fn()}
          onError={vi.fn()}
          onLoadTimeout={onLoadTimeout}
        />,
      );

      expect(onLoadTimeout).not.toHaveBeenCalled();
      vi.advanceTimersByTime(10_000);
      expect(onLoadTimeout).toHaveBeenCalledTimes(1);
    });

    it('does not call onLoadTimeout when the script loads successfully before the timeout', () => {
      const onLoadTimeout = vi.fn();

      render(
        <TurnstileWidget
          siteKey="1x00000000000000000000AA"
          onVerify={vi.fn()}
          onExpire={vi.fn()}
          onError={vi.fn()}
          onLoadTimeout={onLoadTimeout}
        />,
      );

      vi.advanceTimersByTime(10_000);
      expect(onLoadTimeout).not.toHaveBeenCalled();
    });

    it('clears the pending timer on unmount, so onLoadTimeout never fires after the widget is gone', () => {
      mockScriptState.autoLoad = false;
      const onLoadTimeout = vi.fn();

      const { unmount } = render(
        <TurnstileWidget
          siteKey="1x00000000000000000000AA"
          onVerify={vi.fn()}
          onExpire={vi.fn()}
          onError={vi.fn()}
          onLoadTimeout={onLoadTimeout}
        />,
      );

      unmount();
      vi.advanceTimersByTime(10_000);

      expect(onLoadTimeout).not.toHaveBeenCalled();
    });
  });
});
