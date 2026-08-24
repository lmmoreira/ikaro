'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';

interface PhotoTileProps {
  readonly url: string;
  readonly alt: string;
  readonly unavailableLabel: string;
  readonly unavailableAlt: string;
  /** Classes applied to the `<img>` on success — callers keep their own border/background styling. */
  readonly className: string;
}

// Deleted booking photos leave a dangling DB reference by design — the GET goes straight browser-to-GCS, so a missing object only ever surfaces as onError, never a backend error.
export function PhotoTile({
  url,
  alt,
  unavailableLabel,
  unavailableAlt,
  className,
}: PhotoTileProps): React.JSX.Element {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // The browser can load-and-fail a server-rendered <img> before React attaches onError during
  // hydration — a native error event that fires before the listener exists is never replayed, so
  // onError alone misses an image that was already broken at hydration time.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth === 0) {
      setFailed(true);
    }
  }, []);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={unavailableAlt}
        className={`flex flex-col items-center justify-center gap-1 text-gray-400 ${className}`}
      >
        <ImageOff className="h-5 w-5" aria-hidden="true" />
        <span className="text-[0.6875rem] font-medium">{unavailableLabel}</span>
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element -- browser-native loading/error handling is required for this remote preview tile */
    <img
      ref={imgRef}
      src={url}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
