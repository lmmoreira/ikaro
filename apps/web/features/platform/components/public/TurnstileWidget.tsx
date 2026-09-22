'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';

// Cloudflare Turnstile is a plain script + 'use client' wrapper, not an npm package — none is
// installed for it, and none should be added (docs/discovery/lead-form-module/lead-form-module.md
// § Cross-cutting infra: "the widget itself is a plain script ... no heavy SDK needed").
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

const TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

// Real Turnstile script loads typically finish in 1-3s on a normal connection; 10s gives
// generous headroom before treating a stuck load (CSP block, ad-blocker, edge issue, network
// flake) as failed (M20-S15).
const LOAD_TIMEOUT_MS = 10_000;

interface TurnstileWidgetProps {
  readonly siteKey: string;
  readonly onVerify: (token: string) => void;
  readonly onExpire: () => void;
  readonly onError: () => void;
  readonly onLoadTimeout: () => void;
}

export function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
  onError,
  onLoadTimeout,
}: TurnstileWidgetProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);

  // LeadFormFields.tsx passes inline arrow functions for onExpire/onError, so their identity
  // changes on every parent re-render (e.g. every keystroke in a contact field). Reading the
  // latest callback through a ref — updated on every render, but never a dependency itself —
  // keeps renderWidget's own identity (and the effect below) stable across those re-renders.
  // Without this, the effect removed and recreated the real Turnstile widget on every parent
  // re-render, including mid-verification (PR #433 review, CodeRabbit — the direct cause of the
  // widget's iframe never settling into a visible state in real-browser E2E runs).
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  const onLoadTimeoutRef = useRef(onLoadTimeout);
  // Committed in an effect, not assigned directly during render (React 19's
  // react-hooks/refs rule) — a render can run without committing under concurrent
  // rendering, so mutating a ref's value inline in the function body is unsafe.
  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
    onLoadTimeoutRef.current = onLoadTimeout;
  });

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token) => onVerifyRef.current(token),
      'expired-callback': () => onExpireRef.current(),
      'error-callback': () => onErrorRef.current(),
    });
  }, [siteKey]);

  useEffect(() => {
    if (!scriptLoaded) return;
    renderWidget();

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [scriptLoaded, renderWidget]);

  // If <Script>'s onLoad never fires (a CSP block, an ad-blocker, a Cloudflare edge issue, a
  // network flake), the widget otherwise hangs silently forever with no user-facing signal
  // (M20-S15 — this exact gap is what let the soft-navigation CSP bug go unnoticed). Cleared on
  // successful load (scriptLoaded flips true, re-running this effect and skipping a new timer)
  // and on unmount, so a slow-but-eventually-successful load never fires a false positive.
  useEffect(() => {
    if (scriptLoaded) return;
    const timer = setTimeout(() => onLoadTimeoutRef.current(), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [scriptLoaded]);

  return (
    <>
      <Script
        src={TURNSTILE_SCRIPT_SRC}
        strategy="afterInteractive"
        onLoad={() => setScriptLoaded(true)}
      />
      <div ref={containerRef} data-testid="turnstile-widget" />
    </>
  );
}
