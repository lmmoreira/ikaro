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

  it('renders the widget container and calls turnstile.render() with the site key and callbacks once the script loads', () => {
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
    expect(options['callback']).toBe(onVerify);
    expect(options['expired-callback']).toBe(onExpire);
    expect(options['error-callback']).toBe(onError);
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
