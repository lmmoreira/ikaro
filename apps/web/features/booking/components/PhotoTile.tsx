'use client';

import { useState } from 'react';
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
    <img src={url} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />
  );
}
